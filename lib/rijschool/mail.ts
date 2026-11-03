import type { Rijschool } from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendMail, type MailInput } from "@/lib/mail";
import { lesMoment, SOORT_LABEL } from "@/lib/rijschool/format";

// ---------------------------------------------------------------------------
// Mails die ZekerFlex namens een rijschool stuurt: uitnodiging om een
// wachtwoord te kiezen, lesbevestiging, nieuwe proefles (aan de rijschool) en
// annulering. In de naam en kleur van de rijschool; antwoorden gaan naar de
// rijschool zelf (soort "rijschool" in lib/mail/categories.ts). Een mislukte
// mail breekt nooit de boeking: `verstuur` logt en gaat door.
// ---------------------------------------------------------------------------

type School = Pick<Rijschool, "naam" | "slug" | "kleur" | "email" | "telefoon">;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");
export const siteUrl = (r: Pick<Rijschool, "slug">, pad = "") => `${basis()}/rijschool/${r.slug}${pad}`;
const kleurVan = (r: School) => (/^#[0-9a-fA-F]{6}$/.test(r.kleur) ? r.kleur : "#1D4E89");
const voornaam = (naam: string) => naam.trim().split(/\s+/)[0] || naam;

function omlijsting(r: School, titel: string, inhoud: string): string {
  const kleur = kleurVan(r);
  const contact = [r.telefoon, r.email].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#F4F5F1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#17211C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E6E7E1">
<tr><td style="background:${kleur};padding:18px 28px;color:#fff;font-weight:700;font-size:18px">${esc(r.naam)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px;color:#17211C">${esc(titel)}</h1>
${inhoud}
</td></tr>
<tr><td style="padding:16px 28px;background:#F4F5F1;color:#667469;font-size:12px">${esc(r.naam)}${contact ? ` · ${contact}` : ""}<br>Verstuurd via ZekerFlex namens ${esc(r.naam)}.</td></tr>
</table></td></tr></table></body></html>`;
}

const alinea = (tekst: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${tekst}</p>`;
const knop = (r: School, href: string, label: string) =>
  `<p style="margin:0 0 20px"><a href="${esc(href)}" style="display:inline-block;background:${kleurVan(r)};color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600;font-size:14px">${esc(label)}</a></p>`;

const mail = (r: School, to: string, subject: string, text: string, html: string): MailInput => ({
  to,
  subject,
  text: `${text}\n\n${r.naam}${r.telefoon ? ` · ${r.telefoon}` : ""}`,
  html,
  kind: "rijschool",
  ...(r.email ? { replyTo: r.email } : {}),
});

export function uitnodigingMail(r: School, ontvanger: { naam: string; email: string }, soort: "leerling" | "instructeur", token: string, herstel = false): MailInput {
  const link = siteUrl(r, `/inloggen?uitnodiging=${encodeURIComponent(token)}`);
  const wat =
    soort === "leerling"
      ? "In je eigen app zie je je lessen, je voortgang per onderdeel, je huiswerk en je tegoed. Je kunt er ook theorie oefenen."
      : "In de instructeur-app zie je je lesdag, beoordeel je leerlingen tijdens de les en plan je de volgende les in.";
  const intro = herstel
    ? "Je hebt gevraagd om een nieuw wachtwoord. Kies het via de knop hieronder. Heb je dit niet gevraagd? Dan kun je deze mail negeren."
    : `${r.naam} heeft een account voor je klaargezet. ${wat}`;
  return mail(
    r,
    ontvanger.email,
    herstel ? `Nieuw wachtwoord voor ${r.naam}` : `Je account bij ${r.naam}`,
    `Hoi ${voornaam(ontvanger.naam)},\n\n${intro}\n\nKies je wachtwoord via deze link (14 dagen geldig):\n${link}`,
    omlijsting(
      r,
      herstel ? "Nieuw wachtwoord kiezen" : "Je account staat klaar",
      `${alinea(`Hoi ${esc(voornaam(ontvanger.naam))}, ${esc(intro)}`)}
       ${knop(r, link, "Wachtwoord kiezen")}
       <p style="margin:0;font-size:12px;color:#667469">De link is 14 dagen geldig. Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${esc(link)}</span></p>`,
    ),
  );
}

interface LesInfo {
  start: Date;
  eind: Date;
  soort: string;
  ophaaladres: string;
}

export function lesBevestigingMail(r: School, leerling: { naam: string; email: string }, les: LesInfo, instructeur: string): MailInput {
  const wanneer = lesMoment(les.start, les.eind);
  const soort = SOORT_LABEL[les.soort] ?? "Rijles";
  const link = siteUrl(r, "/leerling");
  const adres = les.ophaaladres ? `\nOphaaladres: ${les.ophaaladres}` : "";
  return mail(
    r,
    leerling.email,
    `${soort} ingepland: ${wanneer}`,
    `Hoi ${voornaam(leerling.naam)},\n\nJe ${soort.toLowerCase()} staat gepland op ${wanneer} met ${instructeur}.${adres}\n\nJe lessen en je voorbereiding vind je in de app: ${link}`,
    omlijsting(
      r,
      `${soort} ingepland`,
      `${alinea(`Hoi ${esc(voornaam(leerling.naam))}, je ${esc(soort.toLowerCase())} staat gepland op <strong>${esc(wanneer)}</strong> met ${esc(instructeur)}.`)}
       ${les.ophaaladres ? alinea(`Ophaaladres: ${esc(les.ophaaladres)}`) : ""}
       ${knop(r, link, "Bekijk in de app")}`,
    ),
  );
}

export function proeflesSchoolMail(r: School, leerling: { naam: string; email: string; telefoon: string }, les: LesInfo, instructeur: string): MailInput | null {
  if (!r.email) return null;
  const wanneer = lesMoment(les.start, les.eind);
  const link = `${basis()}/werkgever/rijschool`;
  return {
    ...mail(
      r,
      r.email,
      `Nieuwe proefles: ${leerling.naam}, ${wanneer}`,
      `Er is online een proefles geboekt.\n\nWie: ${leerling.naam} (${leerling.email}${leerling.telefoon ? `, ${leerling.telefoon}` : ""})\nWanneer: ${wanneer}\nInstructeur: ${instructeur}\nOphaaladres: ${les.ophaaladres || "niet opgegeven"}\n\nBekijk het in je beheer: ${link}`,
      omlijsting(
        r,
        "Nieuwe proefles geboekt",
        `${alinea(`<strong>${esc(leerling.naam)}</strong> heeft online een proefles geboekt.`)}
         ${alinea(`Wanneer: ${esc(wanneer)}<br>Instructeur: ${esc(instructeur)}<br>Ophaaladres: ${esc(les.ophaaladres || "niet opgegeven")}<br>Contact: ${esc(leerling.email)}${leerling.telefoon ? `, ${esc(leerling.telefoon)}` : ""}`)}
         ${knop(r, link, "Naar het beheer")}`,
      ),
    ),
    // de rijschool antwoordt de leerling, niet zichzelf
    replyTo: leerling.email,
  };
}

export function lesGeannuleerdMail(r: School, ontvanger: { naam: string; email: string }, les: LesInfo, door: string): MailInput {
  const wanneer = lesMoment(les.start, les.eind);
  const soort = (SOORT_LABEL[les.soort] ?? "Rijles").toLowerCase();
  return mail(
    r,
    ontvanger.email,
    `Les geannuleerd: ${wanneer}`,
    `Hoi ${voornaam(ontvanger.naam)},\n\nDe ${soort} op ${wanneer} is geannuleerd door ${door}.`,
    omlijsting(r, "Les geannuleerd", alinea(`Hoi ${esc(voornaam(ontvanger.naam))}, de ${esc(soort)} op <strong>${esc(wanneer)}</strong> is geannuleerd door ${esc(door)}.`)),
  );
}

export function herinneringMail(r: School & Pick<Rijschool, "annuleerUren">, leerling: { naam: string; email: string }, les: LesInfo, instructeur: string): MailInput {
  const wanneer = lesMoment(les.start, les.eind);
  const soort = (SOORT_LABEL[les.soort] ?? "Rijles").toLowerCase();
  const link = siteUrl(r, "/leerling");
  const verhinderd = `Kun je toch niet? Neem dan zo snel mogelijk contact op${r.telefoon ? ` via ${r.telefoon}` : ""}.`;
  return mail(
    r,
    leerling.email,
    `Morgen ${soort}: ${wanneer}`,
    `Hoi ${voornaam(leerling.naam)},\n\nEen herinnering: morgen heb je ${soort} met ${instructeur}, ${wanneer}.${les.ophaaladres ? `\nOphaaladres: ${les.ophaaladres}` : ""}\n\nBekijk je huiswerk alvast in de app: ${link}\n\n${verhinderd}`,
    omlijsting(
      r,
      `Morgen ${soort}`,
      `${alinea(`Hoi ${esc(voornaam(leerling.naam))}, morgen heb je ${esc(soort)} met ${esc(instructeur)}: <strong>${esc(wanneer)}</strong>.`)}
       ${les.ophaaladres ? alinea(`Ophaaladres: ${esc(les.ophaaladres)}`) : ""}
       ${knop(r, link, "Huiswerk bekijken")}
       ${alinea(esc(verhinderd))}`,
    ),
  );
}

/** Bevestiging van een online (iDEAL-)betaling, met wat er op het tegoed kwam. */
export function betalingOntvangenMail(r: School, leerling: { naam: string; email: string }, b: { omschrijving: string; bedragCent: number }): MailInput {
  const bedrag = (b.bedragCent / 100).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
  const link = siteUrl(r, "/leerling");
  return mail(
    r,
    leerling.email,
    `Betaling ontvangen: ${b.omschrijving}`,
    `Hoi ${voornaam(leerling.naam)},\n\nWe hebben je betaling van ${bedrag} voor ${b.omschrijving} ontvangen. Bedankt! Je tegoed zie je in de app: ${link}`,
    omlijsting(
      r,
      "Betaling ontvangen",
      `${alinea(`Hoi ${esc(voornaam(leerling.naam))}, we hebben je betaling van <strong>${esc(bedrag)}</strong> voor ${esc(b.omschrijving)} ontvangen. Bedankt!`)}
       ${knop(r, link, "Bekijk je tegoed")}`,
    ),
  );
}

/** Uitnodiging om de Android-app te testen (gesloten test in Google Play). */
export function testAppMail(r: School, ontvanger: { naam: string; email: string }, links: { groep: string | null; aanmelden: string; winkel: string }): MailInput {
  const stappen = [
    ...(links.groep ? [{ tekst: "Word lid van de testgroep van Google (met hetzelfde Google-account als op je telefoon).", link: links.groep, label: "Lid worden" }] : []),
    { tekst: "Meld je aan als tester van de app.", link: links.aanmelden, label: "Aanmelden als tester" },
    { tekst: "Installeer de app via Google Play op je Android-telefoon.", link: links.winkel, label: "Naar Google Play" },
  ];
  return mail(
    r,
    ontvanger.email,
    `Test de nieuwe app van ${r.naam}`,
    `Hoi ${voornaam(ontvanger.naam)},\n\n${r.naam} heeft een eigen app voor Android en zoekt testers. Doe je mee? Het kost je een paar minuten. Google vraagt om de app twee weken op je telefoon te houden en af en toe te openen.\n\n${stappen.map((s, i) => `${i + 1}. ${s.tekst}\n${s.link}`).join("\n\n")}\n\nHeb je een iPhone? Dan gebruik je gewoon de app in je browser: ${siteUrl(r, "/leerling")}`,
    omlijsting(
      r,
      "Test onze nieuwe app",
      `${alinea(`Hoi ${esc(voornaam(ontvanger.naam))}, ${esc(r.naam)} heeft een eigen app voor Android en zoekt testers. Doe je mee? Het kost je een paar minuten. Google vraagt om de app twee weken op je telefoon te houden en af en toe te openen.`)}
       ${stappen.map((s, i) => `${alinea(`<strong>${i + 1}.</strong> ${esc(s.tekst)}`)}${knop(r, s.link, s.label)}`).join("")}
       <p style="margin:0;font-size:12px;color:#667469">Heb je een iPhone? Dan gebruik je gewoon de app in je browser: <a href="${esc(siteUrl(r, "/leerling"))}">${esc(siteUrl(r, "/leerling"))}</a></p>`,
    ),
  );
}

export async function verstuur(m: MailInput | null): Promise<boolean> {
  if (!m || !m.to) return false;
  try {
    return (await sendMail(m)).delivered;
  } catch (err) {
    logger.warn("rijschool: mail niet verstuurd", { subject: m.subject, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
