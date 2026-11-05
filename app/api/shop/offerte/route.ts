import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isReservedTestAddress, mailShell, sendMail } from "@/lib/mail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { CONTACTS } from "@/lib/seo";
import { createLead } from "@/lib/sales/leads";
import { recordServerEvent } from "@/lib/analytics/track";
import { isTestOfferte, offerteNotitie, offerteSchema } from "@/lib/shop/offerte-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

// POST /api/shop/offerte — zakelijk offerteverzoek uit de webshop (/shop/zakelijk,
// eventueel met de bestellijst uit de teambestelling). Wordt een warme lead in
// de salespijplijn (/admin/sales) en een mail aan sales; een mens maakt de
// offerte. Openbaar via het /api/shop-voorvoegsel, met een eigen limiet per IP.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "shop-offerte",
      identifier: clientIp(request),
      limit: 5,
      windowSeconds: 600,
      message: "Te veel aanvragen — probeer het later opnieuw.",
    });
    const parsed = offerteSchema.safeParse(
      await request.json().catch(() => {
        throw AppError.validation("Body moet JSON zijn");
      }),
    );
    if (!parsed.success) throw AppError.validation("Controleer je gegevens en zet het vinkje voor akkoord.", parsed.error.flatten());
    const o = parsed.data;
    const notitie = offerteNotitie(o);

    // een test mag nooit als echte lead of mail bij sales aankomen
    if (isReservedTestAddress(o.email) || isTestOfferte(o.email)) {
      logger.info("shop-offerte van testadres overgeslagen", { bedrijf: o.bedrijf });
      return NextResponse.json({ ok: true });
    }

    try {
      await createLead({
        companyName: o.bedrijf,
        contactName: o.naam,
        contactEmail: o.email,
        ...(o.telefoon ? { contactPhone: o.telefoon } : {}),
        source: "webshop-offerte",
        sourceUrl: "/shop/zakelijk",
        notes: notitie,
        createdById: null,
      });
    } catch (e) {
      logger.warn("shop-offerte → sales mislukt", { error: (e as Error).message });
    }
    void recordServerEvent({ path: "/shop/zakelijk", label: "shop-offerte", meta: { company: o.bedrijf, medewerkers: o.medewerkers ?? null } });

    await sendMail({
      to: CONTACTS.sales,
      replyTo: o.email,
      kind: "shop-offerte",
      subject: `Offerteverzoek webshop — ${o.bedrijf}`,
      text: `Offerteverzoek uit de zakelijke webshop\n\nBedrijf: ${o.bedrijf}\nNaam: ${o.naam}\nE-mail: ${o.email}\n${o.telefoon ? `Telefoon: ${o.telefoon}\n` : ""}\n${notitie}\n`,
      html: mailShell(
        "Offerteverzoek uit de webshop",
        `<p style="margin:0 0 4px"><strong>${esc(o.bedrijf)}</strong>${o.medewerkers ? ` — ${o.medewerkers} medewerkers` : ""}</p>
         <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${esc(o.naam)} · ${esc(o.email)}${o.telefoon ? ` · ${esc(o.telefoon)}` : ""}</p>
         <p style="margin:8px 0 0;font-size:14px;color:#3C4A42;white-space:pre-wrap">${esc(notitie)}</p>`,
      ),
    }).catch((e) => logger.warn("shop-offerte mail mislukt", { error: (e as Error).message }));

    logger.info("shop-offerte ontvangen", { bedrijf: o.bedrijf });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.error("shop-offerte mislukt", { error: (err as Error).message });
    return res;
  }
}
