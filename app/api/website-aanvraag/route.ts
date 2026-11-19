import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { lijst } from "@/lib/http/zod-lijst";
import { logger } from "@/lib/logger";
import { sendMail, mailShell, escapeHtml } from "@/lib/mail";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { CONTACTS } from "@/lib/seo";
import { createLead } from "@/lib/sales/leads";
import { BUDGET, FUNCTIES, KLEUREN, LOGO, PAGINAS, SOORTEN, STIJLEN, VIDEO, VOORBEELDEN, WANNEER, aanvraagTekst } from "@/lib/website/aanvraag-opties";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/website-aanvraag: het wensenformulier op /website-maken (19 nov 2026). De aanvraag landt als lead in de
// sales-pijplijn (Beheer → Sales), met alle wensen in de notitie, en de eigenaar krijgt een mail. Een mens maakt daarna
// de voorbeelden; er gaat niets vanzelf naar de aanvrager. Openbaar, gevalideerd en per IP begrensd.
const uit = <T extends readonly string[]>(lijst: T) => z.string().refine((v) => (lijst as readonly string[]).includes(v));
const kort = (max: number) => z.string().trim().max(max).optional();
const schema = z.object({
  bedrijf: z.string().trim().min(2).max(160),
  naam: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefoon: kort(40),
  huidigeSite: kort(200),
  branche: kort(80),
  soort: uit(SOORTEN),
  kleuren: lijst(uit(KLEUREN.map((k) => k.naam)), { min: 0, max: KLEUREN.length }),
  eigenKleur: kort(80),
  stijl: uit(STIJLEN).optional(),
  video: uit(VIDEO).optional(),
  logo: uit(LOGO).optional(),
  paginas: lijst(uit(PAGINAS), { min: 0, max: PAGINAS.length }),
  functies: lijst(uit(FUNCTIES), { min: 0, max: FUNCTIES.length }),
  budget: uit(BUDGET).optional(),
  wanneer: uit(WANNEER).optional(),
  voorbeeld: uit(VOORBEELDEN.map((v) => v.naam)).optional(),
  wensen: kort(3000),
  akkoord: z.literal(true),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "website-aanvraag", identifier: clientIp(request), limit: 5, windowSeconds: 600, message: "Te veel aanvragen. Probeer het later opnieuw." });
    const parsed = schema.safeParse(
      await request.json().catch(() => {
        throw AppError.validation("Body moet JSON zijn");
      }),
    );
    if (!parsed.success) throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    const { akkoord: _akkoord, ...a } = parsed.data;
    const tekst = aanvraagTekst(a);

    try {
      await createLead({
        companyName: a.bedrijf,
        contactName: a.naam,
        contactEmail: a.email,
        contactPhone: a.telefoon,
        sector: a.branche,
        source: "website-aanvraag",
        sourceUrl: "/website-maken",
        notes: `Website-aanvraag met wensen. Binnen een dag drie voorbeelden sturen.\n${tekst}`,
        createdById: null,
      });
    } catch (e) {
      logger.warn("website-aanvraag -> sales mislukt", { error: (e as Error).message });
    }

    // een proefaanvraag met een testadres stuurt geen echte mail naar de eigen postbus van sales
    if (!isReservedTestAddress(a.email)) {
      await sendMail({
        to: CONTACTS.sales,
        replyTo: a.email,
        kind: "website-aanvraag",
        subject: `Website-aanvraag: ${a.bedrijf} (${a.soort})`,
        text: `Nieuwe website-aanvraag via /website-maken\n\nBedrijf: ${a.bedrijf}\nNaam: ${a.naam}\nE-mail: ${a.email}\n${a.telefoon ? `Telefoon: ${a.telefoon}\n` : ""}\n${tekst}\n\nAfspraak op de site: binnen een dag een voorbeeld in drie versies.`,
        html: mailShell(
          "Nieuwe website-aanvraag",
          `<p style="margin:0 0 4px"><strong>${escapeHtml(a.bedrijf)}</strong> (${escapeHtml(a.soort)})</p>
           <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${escapeHtml(a.naam)} · ${escapeHtml(a.email)}${a.telefoon ? ` · ${escapeHtml(a.telefoon)}` : ""}</p>
           <p style="margin:8px 0 0;font-size:14px;color:#3C4A42;white-space:pre-wrap">${escapeHtml(tekst)}</p>
           <p style="margin:12px 0 0;font-size:14px"><strong>Afspraak op de site:</strong> binnen een dag een voorbeeld in drie versies.</p>`,
        ),
      }).catch((e) => logger.warn("website-aanvraag melding mislukt", { error: (e as Error).message }));
    }

    logger.info("website-aanvraag ontvangen", { soort: a.soort });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("website-aanvraag mislukt", { error: (err as Error).message });
    return res;
  }
}
