import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { CONTACTS } from "@/lib/seo";
import { createLead } from "@/lib/sales/leads";
import { euroPrijs, extensie } from "@/lib/domeinen/extensies";
import { leesDomein } from "@/lib/domeinen/naam";
import { beschikbaarheid } from "@/lib/domeinen/beschikbaar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/domeinen/aanvraag — iemand wil een domeinnaam registreren of
// verhuizen naar ZekerFlex. Zolang bestellen en betalen nog niet in de site
// zit, landt dit als warme lead in de sales-pijplijn (/admin/sales) met een
// mail naar sales; een mens registreert of verhuist het domein en stuurt de
// factuur. Openbaar, IP-begrensd, alleen van de eigen site, toestemming verplicht.
const schema = z.object({
  domein: z.string().trim().min(3).max(260),
  soort: z.enum(["registreren", "verhuizen"]),
  naam: z.string().trim().min(2).max(120),
  bedrijf: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().max(40).optional(),
  bericht: z.string().trim().max(2000).optional(),
  consent: z.literal(true),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await enforceRateLimit({ name: "domeinen-aanvraag", identifier: clientIp(request), limit: 5, windowSeconds: 600, message: "Te veel aanvragen. Probeer het later opnieuw." });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    const d = parsed.data;
    const dom = leesDomein(d.domein);
    if (!dom) throw AppError.validation("Deze domeinnaam of extensie kunnen we (nog) niet aanbieden.");
    const domein = `${dom.label}.${dom.tld}`;
    const prijs = euroPrijs(extensie(dom.tld)?.prijsCent ?? 0);
    const status = await beschikbaarheid(domein);
    if (d.soort === "registreren" && status === "bezet") {
      throw AppError.validation(`${domein} is al bezet. Is hij van jou? Kies dan "verhuizen".`);
    }
    const wat = d.soort === "registreren" ? `Registreren: ${domein} (${prijs} per jaar, excl. btw)` : `Verhuizen naar ZekerFlex: ${domein}`;

    try {
      await createLead({
        companyName: d.bedrijf || d.naam,
        contactName: d.naam,
        contactEmail: d.email,
        ...(d.telefoon ? { contactPhone: d.telefoon } : {}),
        source: "domein-aanvraag",
        sourceUrl: "/domeinnaam",
        notes: `${wat}. Beschikbaarheid bij aanvraag: ${status}.${d.bericht ? ` Bericht: ${d.bericht}` : ""}`,
        createdById: null,
      });
    } catch (e) {
      logger.warn("domein-aanvraag -> sales mislukt", { error: (e as Error).message });
    }

    await sendMail({
      to: CONTACTS.sales,
      replyTo: d.email,
      kind: "domein-aanvraag",
      subject: `Domein-aanvraag: ${domein} (${d.soort})`,
      text: `${wat}\nBeschikbaarheid bij aanvraag: ${status}\n\nNaam: ${d.naam}\n${d.bedrijf ? `Bedrijf: ${d.bedrijf}\n` : ""}E-mail: ${d.email}\n${d.telefoon ? `Telefoon: ${d.telefoon}\n` : ""}${d.bericht ? `\nBericht:\n${d.bericht}\n` : ""}\nRegistreren of verhuizen kan in TransIP; de lead staat in Admin → Sales.`,
    });
    return NextResponse.json({ ok: true, domein, soort: d.soort });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
