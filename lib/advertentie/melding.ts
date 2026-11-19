import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isReservedTestAddress, mailButton, mailShell, sendMail } from "@/lib/mail";
import { meldGebeurtenis } from "@/lib/ops/melder";
import { CONTACTS } from "@/lib/seo";
import { BEWAAR_DAGEN, ONTWERPEN, PAKKET_NAAM, prijsTekst, type Advertentie, type Prijzen } from "@/lib/advertentie/regels";
import { LOGOS, type Logo } from "@/lib/logo/regels";

// De berichten rond een advertentie op maat en een logo van de logo maker. Aan de eigenaar: een regel in de melder
// (lib/ops/melder.ts, zonder naam of adres) en een mail aan sales met de gegevens. Een melding naar een intern adres
// gaat altijd echt weg, dus bij een testadres van de aanvrager slaan we beide over (AGENTS.md). Aan de klant: na
// vrijgave de link naar zijn pagina. Nooit gooien: de aanvraag of de vrijgave staat al.

const BEHEER = "/admin/advertentie-op-maat";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");
const ontwerpNaam = (nr: number) => ONTWERPEN.find((o) => o.nr === nr)?.naam ?? String(nr);
const logoNaam = (nr: number) => LOGOS.find((l) => l.nr === nr)?.naam ?? String(nr);

interface Klant {
  naam: string;
  email: string;
  telefoon?: string | undefined;
}

async function meld(v: { wat: string; soort: string; bedrijf: string; keuze: string; klant: Klant }): Promise<void> {
  if (isReservedTestAddress(v.klant.email)) return;
  const k = v.klant;
  await meldGebeurtenis({ soort: "marketing", titel: `${v.wat} aangevraagd`, url: BEHEER });
  await sendMail({
    to: CONTACTS.sales,
    replyTo: k.email,
    kind: `${v.soort}-aanvraag`,
    subject: `${v.wat}: aanvraag van ${v.bedrijf}`,
    text: `${v.bedrijf} vroeg aan: ${v.wat.toLowerCase()}.\n\nKeuze: ${v.keuze}\nNaam: ${k.naam}\nE-mail: ${k.email}\n${k.telefoon ? `Telefoon: ${k.telefoon}\n` : ""}\nStuur een betaalverzoek en klik daarna op Vrijgeven: ${basis()}${BEHEER}`,
    html: mailShell(
      `${v.wat}: aanvraag`,
      `<p style="margin:0 0 4px"><strong>${esc(v.bedrijf)}</strong></p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${esc(k.naam)} · ${esc(k.email)}${k.telefoon ? ` · ${esc(k.telefoon)}` : ""}</p>
       <p style="margin:0 0 12px;font-size:14px;color:#17211C"><strong>Keuze:</strong> ${esc(v.keuze)}</p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">Stuur een betaalverzoek en klik daarna op Vrijgeven. De klant krijgt dan vanzelf de link naar de schone bestanden.</p>
       <p style="margin:0">${mailButton(`${basis()}${BEHEER}`, "Open in Beheer")}</p>`,
    ),
  }).catch((e) => logger.warn("aanvraag: melding aan sales mislukt", { soort: v.soort, error: (e as Error).message }));
}

/** De mail aan de klant na vrijgave. Geeft terug of hij wegging. */
async function lever(v: { soort: string; onderwerp: string; kop: string; klant: Klant; zin: string; link: string; knop: string }): Promise<boolean> {
  const bewaar = `De link blijft ${BEWAAR_DAGEN} dagen werken. Bewaar de bestanden dus op je eigen computer of telefoon.`;
  try {
    const r = await sendMail({
      to: v.klant.email,
      from: env.MAIL_FROM,
      replyTo: CONTACTS.sales,
      kind: `${v.soort}-vrijgave`,
      subject: v.onderwerp,
      text: `Hoi ${v.klant.naam},\n\nBedankt voor je betaling. ${v.zin}\n\nDownload hier: ${v.link}\n\n${bewaar}\n\nGroet,\nZekerFlex`,
      html: mailShell(
        v.kop,
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${esc(v.klant.naam)}, bedankt voor je betaling. ${esc(v.zin)}</p>
         <p style="margin:0 0 14px">${mailButton(v.link, v.knop)}</p>
         <p style="margin:0;font-size:13px;line-height:1.6;color:#5B6861">${bewaar}</p>`,
      ),
    });
    return Boolean(r?.delivered);
  } catch (e) {
    logger.warn("vrijgavemail mislukt", { soort: v.soort, error: (e as Error).message });
    return false;
  }
}

export async function meldAanvraag(ad: Advertentie, prijzen: Prijzen): Promise<void> {
  const a = ad.aanvraag;
  if (!a) return;
  await meld({ wat: "Advertentie op maat", soort: "advertentie", bedrijf: ad.invoer.bedrijf, klant: a, keuze: `${PAKKET_NAAM[a.pakket]} (${prijsTekst(prijzen, a.pakket)}), aangeklikt: ontwerp ${a.ontwerp} (${ontwerpNaam(a.ontwerp)})` });
}

export async function stuurVrijgave(ad: Advertentie): Promise<boolean> {
  const a = ad.aanvraag;
  if (!a) return false;
  const wat = a.pakket === "alle" ? "alle drie de ontwerpen" : `het ontwerp "${ontwerpNaam(a.ontwerp)}"`;
  return lever({
    soort: "advertentie",
    onderwerp: `Je advertentie van ${ad.invoer.bedrijf} staat klaar`,
    kop: "Je advertentie staat klaar",
    klant: a,
    zin: `Je advertentie van ${ad.invoer.bedrijf} staat klaar: ${wat}, zonder watermerk, in drie formaten (vierkant, verhaal en liggend).`,
    link: `${basis()}/advertentie-op-maat/${ad.id}`,
    knop: "Download je advertentie",
  });
}

export async function meldLogoAanvraag(logo: Logo, prijzen: Prijzen): Promise<void> {
  const a = logo.aanvraag;
  if (!a) return;
  await meld({ wat: "Logo", soort: "logo", bedrijf: logo.invoer.naam, klant: a, keuze: `logo ${a.logo} (${logoNaam(a.logo)}), ${prijsTekst(prijzen, "logo")}` });
}

export async function stuurLogoVrijgave(logo: Logo): Promise<boolean> {
  const a = logo.aanvraag;
  if (!a) return false;
  return lever({
    soort: "logo",
    onderwerp: `Je logo van ${logo.invoer.naam} staat klaar`,
    kop: "Je logo staat klaar",
    klant: a,
    zin: `Het logo van ${logo.invoer.naam} staat klaar, zonder watermerk: in kleur op wit, in kleur, wit en zwart zonder achtergrond, en als vierkant icoon.`,
    link: `${basis()}/logo-maker/${logo.id}`,
    knop: "Download je logo",
  });
}
