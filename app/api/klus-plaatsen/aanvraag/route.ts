import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { sendMail, mailShell, escapeHtml } from "@/lib/mail";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { CONTACTS } from "@/lib/seo";
import { createLead } from "@/lib/sales/leads";
import { recordServerEvent } from "@/lib/analytics/track";
import { AANVRAAG_MAX, aanvraagOntbreekt, aanvraagSamenvatting } from "@/lib/klusconcept/aanvraag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/klus-plaatsen/aanvraag: "Liever zonder account? Wij zetten je klus voor je online" (lib/klusconcept/aanvraag.ts).
// Een bedrijf laat zijn naam en een telefoonnummer of e-mailadres achter bij de klus die het op /klus-plaatsen samenstelde.
// Dat wordt een verkoopaanvraag (Beheer → Sales, bron "klus-aanvraag") en een mail aan sales@; er komt niets online. Openbaar
// (voorvoegsel /api/klus-plaatsen in lib/auth/public-routes.ts), dus: eerst de grootte van de body begrensd (422), alleen van de
// eigen site, IP- en dagbegrensd (429), en een verborgen botveld. Een testadres (.test e.d.) maakt geen aanvraag en geen mail.

const MAX_BODY = 16_384;

const schema = z.object({
  naam: z.string().max(AANVRAAG_MAX.naam),
  bedrijf: z.string().max(AANVRAAG_MAX.bedrijf),
  telefoon: z.string().max(AANVRAAG_MAX.telefoon).default(""),
  email: z.string().max(AANVRAAG_MAX.email).default(""),
  /** botveld: mensen zien het niet en laten het leeg */
  extra: z.string().max(200).optional(),
  klus: z
    .object({
      functie: z.string().max(AANVRAAG_MAX.functie).default(""),
      plaats: z.string().max(AANVRAAG_MAX.plaats).default(""),
      datum: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
      van: z.string().regex(/^(\d{2}:\d{2})?$/).default(""),
      tot: z.string().regex(/^(\d{2}:\d{2})?$/).default(""),
      aantal: z.number().int().min(0).max(50).default(0),
      tariefCents: z.number().int().min(0).max(100_000).default(0),
      omschrijving: z.string().max(AANVRAAG_MAX.omschrijving).optional(),
    })
    .default({ functie: "", plaats: "", datum: "", van: "", tot: "", aantal: 0, tariefCents: 0 }),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const lengte = Number(request.headers.get("content-length") ?? "0");
    if (lengte > MAX_BODY) throw AppError.validation("Je aanvraag is te lang. Maak de omschrijving korter.");
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const ip = clientIp(request);
    await enforceRateLimit({
      name: "klus-aanvraag",
      identifier: privateRateLimitIdentifier(ip),
      limit: 5,
      windowSeconds: 600,
      message: "Je hebt net al een aanvraag gestuurd. Probeer het over een paar minuten opnieuw.",
    });
    await enforceRateLimit({ name: "klus-aanvraag-dag", identifier: "alle", limit: 200, windowSeconds: 86_400, message: "Vandaag kwamen er al veel aanvragen binnen. Probeer het morgen opnieuw." });

    const b = schema.safeParse(await request.json().catch(() => null));
    if (!b.success) throw AppError.validation("Controleer je gegevens en probeer het opnieuw.", b.error.flatten());
    const d = b.data;
    // een bot vult het verborgen veld in: die krijgt een gewoon antwoord, zonder aanvraag of mail
    if (d.extra?.trim()) return NextResponse.json({ ok: true });
    const mist = aanvraagOntbreekt(d);
    if (mist) throw AppError.validation(mist.tekst);

    const naam = d.naam.trim();
    const bedrijf = d.bedrijf.trim();
    const telefoon = d.telefoon.trim();
    const email = d.email.trim().toLowerCase();
    if (email && isReservedTestAddress(email)) return NextResponse.json({ ok: true, test: true });

    const regels = aanvraagSamenvatting(d.klus);
    try {
      await createLead({
        companyName: bedrijf,
        contactName: naam,
        ...(email ? { contactEmail: email } : {}),
        ...(telefoon ? { contactPhone: telefoon } : {}),
        ...(d.klus.plaats.trim() ? { city: d.klus.plaats.trim() } : {}),
        source: "klus-aanvraag",
        sourceUrl: "/klus-plaatsen",
        notes: ["Klus samengesteld op /klus-plaatsen; wil dat we hem samen online zetten (zonder account).", ...regels].join("\n"),
        createdById: null,
      });
    } catch (e) {
      logger.warn("klus-aanvraag -> sales lead mislukt", { error: (e as Error).message });
    }

    void recordServerEvent({ path: "/klus-plaatsen", label: "klus-aanvraag", meta: { functie: d.klus.functie.slice(0, 60) } });

    const contact = [telefoon ? `Telefoon: ${telefoon}` : null, email ? `E-mail: ${email}` : null].filter(Boolean) as string[];
    await sendMail({
      to: CONTACTS.sales,
      ...(email ? { replyTo: email } : {}),
      kind: "klus-aanvraag",
      subject: `Klus-aanvraag zonder account: ${bedrijf}`,
      text: `${bedrijf} wil een klus online zetten en vraagt of wij contact opnemen.\n\nNaam: ${naam}\n${contact.join("\n")}\n\n${regels.join("\n")}\n\nDe aanvraag staat ook in Beheer → Sales (bron klus-aanvraag).`,
      html: mailShell(
        "Klus-aanvraag zonder account",
        `<p style="margin:0 0 4px"><strong>${escapeHtml(bedrijf)}</strong></p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${escapeHtml(naam)}${contact.length ? ` · ${contact.map(escapeHtml).join(" · ")}` : ""}</p>
         ${regels.map((r) => `<p style="margin:0 0 4px;font-size:14px;color:#17211C">${escapeHtml(r)}</p>`).join("")}
         <p style="margin:12px 0 0;font-size:12px;color:#667469">Ook in Beheer → Sales (bron klus-aanvraag). Bel of mail binnen één werkdag: dat beloofde de pagina.</p>`,
      ),
    }).catch((e) => logger.warn("klus-aanvraag melding mislukt", { error: (e as Error).message }));

    logger.info("klus-aanvraag ontvangen", { functie: d.klus.functie.slice(0, 60) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    if (status >= 500) logger.error("klus-aanvraag mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status, headers });
  }
}
