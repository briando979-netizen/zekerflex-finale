import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { escapeHtml, sendMail } from "@/lib/mail";
import { vouw } from "@/lib/voorstel/ics-bestand";
import { annuleerTotMinVan, datumTijdLang, type Afspraak, type Instellingen } from "@/lib/afspraken/model";
import { geefAnnuleerToken, planHerinnering, trekTokenIn } from "@/lib/afspraken/store";

// ---------------------------------------------------------------------------
// Mail aan de klant van een bedrijf: bevestiging, herinnering en bevestiging van annuleren. Alleen bij een online
// boeking met een e-mailadres (het vinkje op de boekpagina dekt "mij daarover te bereiken"). Altijd "best effort": de
// functies voor het boeken en annuleren gooien nooit, en de routes roepen ze aan na het antwoord (runAfter), dus een
// mislukte mail laat het boeken nooit falen of vertragen. In het log staan geen persoonsgegevens, geen adres en
// nooit de link; alleen de organisatie en het soort mail.
// ---------------------------------------------------------------------------

export type KlantMailSoort = "bevestiging" | "herinnering" | "geannuleerd";

const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");
export const annuleerUrl = (slug: string, token: string): string => `${basis()}/boeken/${slug}/afspraak/${token}`;
export const boekUrl = (slug: string): string => `${basis()}/boeken/${slug}`;

export interface KlantMailTekst {
  onderwerp: string;
  tekst: string;
  html: string;
}

/**
 * De tekst van de mail (puur). `link` is de persoonlijke annuleerpagina; bij "geannuleerd" is dat de boekpagina
 * om opnieuw te boeken. Alles wat de klant of het bedrijf intikte gaat door escapeHtml in de html-versie.
 */
export function klantMail(soort: KlantMailSoort, a: Afspraak, i: Pick<Instellingen, "bedrijfsnaam" | "annuleerTotMin">, link: string): KlantMailTekst {
  const wanneer = datumTijdLang(a.start);
  const wat = `${a.dienstNaam}${a.medewerkerNaam ? ` bij ${a.medewerkerNaam}` : ""}`;
  const voornaam = a.klant.naam.split(" ")[0] || a.klant.naam;
  const regels: string[] = [`Dienst: ${wat}`, `Wanneer: ${wanneer}`, `Duur: ${a.duurMin} minuten`, `Bij: ${i.bedrijfsnaam}`];
  let onderwerp: string;
  let inleiding: string;
  let actie: string;
  let knop: string;
  let slot: string;
  if (soort === "bevestiging") {
    onderwerp = `Je afspraak bij ${i.bedrijfsnaam} op ${wanneer}`;
    inleiding = `Hoi ${voornaam}, je afspraak bij ${i.bedrijfsnaam} staat vast.`;
    actie = "Kun je toch niet? Annuleer dan via deze persoonlijke link:";
    knop = "Afspraak annuleren";
    slot = `${annuleerZin(annuleerTotMinVan(i))} Daarna kun je het beste het bedrijf bellen. Deze link is persoonlijk: deel hem niet.`;
  } else if (soort === "herinnering") {
    onderwerp = `Herinnering: je afspraak bij ${i.bedrijfsnaam} op ${wanneer}`;
    inleiding = `Hoi ${voornaam}, een herinnering aan je afspraak bij ${i.bedrijfsnaam}.`;
    actie = "Kun je toch niet? Annuleer dan via deze persoonlijke link:";
    knop = "Afspraak annuleren";
    slot = `${annuleerZin(annuleerTotMinVan(i))} Daarna kun je het beste het bedrijf bellen.`;
  } else {
    onderwerp = `Je afspraak bij ${i.bedrijfsnaam} is geannuleerd`;
    inleiding = `Hoi ${voornaam}, je afspraak bij ${i.bedrijfsnaam} is geannuleerd.`;
    actie = "Wil je een nieuwe afspraak maken?";
    knop = "Nieuwe afspraak maken";
    slot = "";
  }
  const tekst = [inleiding, "", ...regels, "", actie, link, ...(slot ? ["", slot] : []), "", `Afspraken via ZekerFlex namens ${i.bedrijfsnaam}.`].join("\n");
  const e = escapeHtml;
  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:#F4F5F1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#17211C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:14px;border:1px solid #E6E7E1"><tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px">${e(onderwerp)}</h1>
<p style="margin:0 0 14px;font-size:15px">${e(inleiding)}</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6">${regels.map((r) => e(r)).join("<br>")}</p>
<p style="margin:0 0 14px;font-size:14px">${e(actie)}</p>
<p style="margin:0 0 18px"><a href="${e(link)}" style="display:inline-block;background:#0E5C4A;color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600;font-size:14px">${e(knop)}</a></p>
${slot ? `<p style="margin:0 0 14px;font-size:13px;color:#667469">${e(slot)}</p>` : ""}
<p style="margin:0;font-size:12px;color:#667469">Afspraken via ZekerFlex namens ${e(i.bedrijfsnaam)}.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { onderwerp, tekst, html };
}

/** 120 → "Annuleren kan tot 2 uur voor de afspraak.", 0 → "Annuleren kan tot het moment dat de afspraak begint." */
export function annuleerZin(min: number): string {
  if (min === 0) return "Annuleren kan tot het moment dat de afspraak begint.";
  const duur = min % 1440 === 0 ? `${min / 1440} dag${min === 1440 ? "" : "en"}` : min % 60 === 0 ? `${min / 60} uur` : `${min} minuten`;
  return `Annuleren kan tot ${duur} voor de afspraak.`;
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const tekstEsc = (s: string) => s.replace(/([\\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** Het agendabestand van de afspraak (tijden in UTC met Z, vaste UID per afspraak). Geen gegevens van de klant erin. */
export function icsVoorAfspraak(a: Afspraak, bedrijfsnaam: string, nu: Date): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZekerFlex//Afspraken//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:afspraak-${a.id}@zekerflex.com`,
    `DTSTAMP:${utc(nu)}`,
    `DTSTART:${utc(new Date(a.start))}`,
    `DTEND:${utc(new Date(a.eind))}`,
    `SUMMARY:${tekstEsc(`${a.dienstNaam} bij ${bedrijfsnaam}`)}`,
    `DESCRIPTION:${tekstEsc(`${a.dienstNaam}${a.medewerkerNaam ? ` bij ${a.medewerkerNaam}` : ""}. Kun je niet? Annuleer via de link in de bevestigingsmail.`)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(vouw)
    .join("\r\n");
}

/** Mailt een afspraak met zijn eigen, nieuwe annuleerlink. Geeft terug of de mail is weggegaan. Gooit nooit. */
async function stuur(tenantId: string, soort: KlantMailSoort, a: Afspraak, i: Instellingen, nu: Date): Promise<boolean> {
  try {
    if (!a.klant.email) return false;
    let link: string;
    let token: string | null = null;
    if (soort === "geannuleerd") {
      link = boekUrl(i.slug);
    } else {
      token = await geefAnnuleerToken(tenantId, a.id);
      if (!token) return false;
      link = annuleerUrl(i.slug, token);
    }
    const m = klantMail(soort, a, i, link);
    try {
      const uitslag = await sendMail({
        to: a.klant.email,
        subject: m.onderwerp,
        text: m.tekst,
        html: m.html,
        kind: `afspraak-${soort}`,
        ...(soort === "geannuleerd" ? {} : { attachments: [{ filename: "afspraak.ics", contentType: "text/calendar; charset=utf-8; method=PUBLISH", content: icsVoorAfspraak(a, i.bedrijfsnaam, nu) }] }),
      });
      // sendMail bewaart een mislukte bezorging in de eigen postbus en meldt een fout: dat telt als niet verstuurd
      if (uitslag?.error) throw new Error("bezorging mislukt");
    } catch (err) {
      // geen link laten staan die nergens heen is gemaild
      if (token) await trekTokenIn(tenantId, a.id, token).catch(() => undefined);
      throw err;
    }
    return true;
  } catch (err) {
    logger.warn("afspraakmail aan klant mislukt", { tenantId, soort, fout: (err as Error).name });
    return false;
  }
}

/**
 * De bevestiging na een online boeking, en de afspraak in het wachtrijtje voor de herinnering. Alleen met een
 * e-mailadres. Gooit nooit.
 */
export async function stuurBevestiging(tenantId: string, a: Afspraak, i: Instellingen, nu: Date = new Date()): Promise<void> {
  try {
    if (a.bron !== "online" || !a.klant.email) return;
    // altijd in het rijtje: de cron kijkt pas bij het versturen of het bedrijf herinneringen aan heeft, zodat een bedrijf
    // dat het later aanzet ook voor bestaande afspraken herinnert
    await planHerinnering(tenantId, a);
    await stuur(tenantId, "bevestiging", a, i, nu);
  } catch (err) {
    logger.warn("afspraakbevestiging mislukt", { tenantId, fout: (err as Error).name });
  }
}

/** De herinnering. True als de mail is weggegaan. Gooit nooit. */
export const stuurHerinnering = (tenantId: string, a: Afspraak, i: Instellingen, nu: Date = new Date()): Promise<boolean> => stuur(tenantId, "herinnering", a, i, nu);

/** De bevestiging dat de klant zelf geannuleerd heeft (met een link om opnieuw te boeken). Gooit nooit. */
export async function stuurAnnulering(tenantId: string, a: Afspraak, i: Instellingen, nu: Date = new Date()): Promise<void> {
  await stuur(tenantId, "geannuleerd", a, i, nu);
}
