import { formDataBegrensd } from "@/lib/http/body-grens";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { clientIp } from "@/lib/http/request";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { isDatum } from "@/lib/horeca/reserveren";
import { renderReserveerPagina } from "@/lib/sites/render";
import { controleerReservering, datumTekst, leesReserveerInvoer, nuInNL, personenTekst, reserveerBlokVan, voorbeeldVol } from "@/lib/sites/reserveren";
import { maakReservering, reserveerStaat, type SiteReservering } from "@/lib/sites/reserveringen-opslag";
import { siteHeaders, siteText, type ServeOptions } from "@/lib/sites/serve";
import type { LiveSite } from "@/lib/sites/store";
import type { Company } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// POST …/_zf/reservering: een tafel reserveren op een klantsite. Opslag:
// lib/sites/reserveringen-opslag.ts. De gast krijgt een bevestiging, de zaak
// een bericht. Een voorbeeld of ontwerpvoorstel bewaart en verstuurt niets:
// de gast ziet wel de hele weg, tot en met de bevestiging.
// ---------------------------------------------------------------------------

/** De mail aan de zaak. */
export function reserveerMailZaak(r: SiteReservering, adres: string): string {
  return [
    `Nieuwe reservering ${r.nr} via ${adres}.`,
    "",
    `${datumTekst(r.datum)} om ${r.tijd}, ${personenTekst(r.personen)}.`,
    "",
    `Naam: ${r.naam}`,
    `E-mail: ${r.email}`,
    `Telefoon: ${r.telefoon}`,
    ...(r.opmerking ? ["", `Opmerking: ${r.opmerking}`] : []),
    "",
    "De gast heeft een bevestiging per mail gekregen. Beantwoord deze mail om de gast te bereiken. Al je reserveringen staan in de Websitestudio onder Reserveringen.",
  ].join("\n");
}

/** De bevestiging aan de gast: wanneer, waar, en hoe je afzegt. */
export function reserveerMailGast(r: SiteReservering, c: Company): string {
  const adres = [c.straat, [c.postcode, c.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const afzeggen = [c.telefoon && `bel ${c.telefoon}`, c.email && `mail naar ${c.email}`].filter(Boolean).join(" of ");
  return [
    `Hallo ${r.naam},`,
    "",
    `Je tafel bij ${c.naam} is gereserveerd:`,
    `${datumTekst(r.datum)} om ${r.tijd}, ${personenTekst(r.personen)}.`,
    `Reserveringsnummer: ${r.nr}`,
    ...(adres ? ["", `Adres: ${adres}`] : []),
    ...(r.opmerking ? ["", `Je opmerking: ${r.opmerking}`] : []),
    "",
    afzeggen ? `Kun je toch niet komen? Laat het ons weten: ${afzeggen}. Je kunt ook op deze mail antwoorden.` : "Kun je toch niet komen? Antwoord dan op deze mail.",
    "",
    `Tot dan!`,
    c.naam,
  ].join("\n");
}

/**
 * POST …/_zf/reservering. `gereserveerd` is het adres van de bevestigingspagina (zonder ?nr),
 * `address` hoe de mail de site noemt.
 */
export async function handleSiteReservering(request: Request, live: LiveSite, opts: ServeOptions & { gereserveerd: string; address: string }): Promise<Response> {
  const blok = reserveerBlokVan(live.snapshot.pages);
  if (!blok) return siteText("Op deze website kun je niet online reserveren.", 404, opts);
  const html = (doc: string | null, status = 200) => (doc ? new Response(doc, { status, headers: siteHeaders("text/html; charset=utf-8", "no-store", opts) }) : siteText("Deze pagina bestaat niet.", 404, opts));
  try {
    await enforceRateLimit({ name: "site-reserveer-ip", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 8, windowSeconds: 600, message: "Te veel reserveringen. Probeer het later opnieuw." });
    await enforceRateLimit({ name: "site-reserveer-site", identifier: live.siteId, limit: 400, windowSeconds: 86_400, message: "Deze website neemt vandaag geen reserveringen meer aan." });
  } catch {
    return siteText("Te veel reserveringen in korte tijd. Probeer het later opnieuw, of bel de zaak.", 429, opts);
  }
  // een tekstformulier: begrensd ingelezen (12 nov), de server laat anders tot 25 MB door
  const form = await formDataBegrensd(request, 64_000).catch(() => null);
  if (!form) return siteText("Ongeldig formulier.", 400, opts);
  // honeypot: mensen vullen het verborgen veld nooit in, bots wel: doe alsof het lukte
  if (String(form.get("website") ?? "").trim()) return new Response(null, { status: 303, headers: { Location: opts.gereserveerd } });

  const nu = nuInNL();
  const invoer = leesReserveerInvoer((k) => form.get(k));
  const opnieuw = async (fouten: string[]) => {
    const q = new URLSearchParams({ datum: invoer.datum, personen: String(invoer.personen) });
    const w = await reserveerStaat(live, blok, q, nu);
    return html(renderReserveerPagina(live.snapshot, w.soort === "reserveren" ? { soort: "reserveren", staat: { ...w.staat, invoer, fouten } } : w, opts), 422);
  };

  // een voorbeeld of voorstel: dezelfde controle, dan de bevestiging zonder iets te bewaren of te versturen
  // (een voorstel draagt het echte e-mailadres van een bedrijf: daar mag nooit iets heen)
  if (live.snapshot.voorbeeld || live.snapshot.voorstel) {
    const fouten = controleerReservering(blok, invoer, [], nu, voorbeeldVol(blok, invoer.datum));
    if (fouten.length) return opnieuw(fouten);
    const q = new URLSearchParams({ datum: invoer.datum, tijd: invoer.tijd, personen: String(invoer.personen) });
    return new Response(null, { status: 303, headers: { Location: `${opts.gereserveerd}?${q}` } });
  }

  if (!isDatum(invoer.datum)) return opnieuw(["Kies een dag."]);
  const uit = await maakReservering(live.siteId, blok, invoer, "website", nu);
  if ("fouten" in uit) return opnieuw(uit.fouten);
  const rec = uit.rec;
  const c = live.snapshot.bedrijf;
  if (c.email) {
    await sendMail({ to: c.email, replyTo: rec.email, kind: "site-reservering", subject: `Nieuwe reservering: ${datumTekst(rec.datum)} ${rec.tijd}, ${personenTekst(rec.personen)} (${rec.naam})`, text: reserveerMailZaak(rec, opts.address) }).catch((err) =>
      logger.warn("site reservation mail failed", { siteId: live.siteId, err: String(err) }),
    );
  }
  await sendMail({ to: rec.email, ...(c.email ? { replyTo: c.email } : {}), kind: "site-reservering-gast", subject: `Je reservering bij ${c.naam}: ${datumTekst(rec.datum)} om ${rec.tijd}`, text: reserveerMailGast(rec, c) }).catch((err) =>
    logger.warn("site reservation guest mail failed", { siteId: live.siteId, err: String(err) }),
  );
  return new Response(null, { status: 303, headers: { Location: `${opts.gereserveerd}?nr=${rec.nr}` } });
}
