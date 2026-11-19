import { sendMail, type MailInput } from "@/lib/mail";
import { dagTekst } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { HERSTEL_MINUTEN, SUBDOMEIN_HOST, UITNODIGING_DAGEN } from "@/lib/voorstel/smileyapp-account-regels";
import { DEMO_MINUTEN, afspraakIcs, afspraakTekst } from "@/lib/voorstel/smileyapp-agenda-regels";
import { vul } from "@/lib/voorstel/smileyapp-teksten";
import { OPEN_NA_DAGEN, type WeekCijfers } from "@/lib/voorstel/smileyapp-week-regels";

// ---------------------------------------------------------------------------
// Deel 6a: ook de melding en de bevestiging van een demo-afspraak uit de agenda
// (de bevestiging gaat naar de aanvrager die zelf een tijd koos, met een
// agendabestand) en de wekelijkse mail aan de beheerders (alleen aantallen).
// Mails van het SmileyApp-beheer (19 nov 2026): de uitnodiging om een
// wachtwoord te kiezen, de link bij "wachtwoord vergeten", en een korte melding
// aan de beheerders bij een nieuwe demo-aanvraag of partner-aanmelding. In de kleuren van SmileyApp, zonder
// plaatjes of iets van buiten. Beide soorten staan niet in
// lib/mail/categories.ts en gelden dus als noodzakelijk en automatisch: er komt
// vanzelf een regel onder dat het een automatisch bericht van ZekerFlex is.
// De link met het token staat alleen in de mail zelf, nooit in een logregel.
// ---------------------------------------------------------------------------

const INKT = "#0E2A20";
const GROEN = "#5ABA8E";
const ZON = "#FDD11A";
const CREME = "#FFFBEA";
const GRIJS = "#4B5E55";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
/** Eén regel zonder stuurtekens, voor een onderwerp of een naam die iemand zelf intypte. */
const regel = (s: string, max = 80) =>
  s
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** `o.buiten`: een mail aan iemand buiten het team (de bevestiging van een afspraak): zonder het woord "beheer", in de taal van de lezer. */
function omlijsting(titel: string, inhoud: string, o: { buiten?: boolean; taal?: string } = {}): string {
  return `<!doctype html><html lang="${esc(o.taal ?? "nl")}"><body style="margin:0;background:${CREME};font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${INKT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #E3EDE7">
<tr><td style="background:${INKT};padding:20px 28px;color:#ffffff;font-weight:700;font-size:18px">Smileyapp${o.buiten ? "" : ` <span style="color:${ZON}">beheer</span>`}</td></tr>
<tr><td style="height:4px;background:${GROEN};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.25;color:${INKT}">${esc(titel)}</h1>
${inhoud}
</td></tr>
</table></td></tr></table></body></html>`;
}

const alinea = (tekst: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${GRIJS}">${tekst}</p>`;
const knop = (href: string, label: string) =>
  `<p style="margin:4px 0 22px"><a href="${esc(href)}" style="display:inline-block;background:${ZON};color:${INKT};text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:700;font-size:15px">${esc(label)}</a></p>`;

/** De uitnodiging: `link` is het adres van het beheer met ?uitnodiging=<token>. */
export function uitnodigingMail(o: { naam: string; email: string; door: string; link: string }): MailInput {
  const naam = regel(o.naam);
  const door = regel(o.door);
  const tekst = `${door} heeft je toegevoegd aan het beheer van de SmileyApp-website.`;
  const slot = `De link werkt ${UITNODIGING_DAGEN} dagen. Ken je ${door} niet, dan kun je deze mail weggooien.`;
  return {
    to: o.email,
    subject: `${door} nodigt je uit voor het beheer van SmileyApp`,
    text: `Hallo ${naam},\n\n${tekst} Kies een wachtwoord via deze link:\n${o.link}\n\n${slot}`,
    html: omlijsting(
      "Je bent uitgenodigd",
      `${alinea(`Hallo ${esc(naam)}, ${esc(tekst)} Klik op de knop om een wachtwoord te kiezen.`)}
${knop(o.link, "Kies een wachtwoord")}
${alinea(esc(slot))}
<p style="margin:0;font-size:12px;line-height:1.5;color:${GRIJS}">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${esc(o.link)}</span></p>`,
    ),
    kind: "smileyapp-uitnodiging",
  };
}

/** Verstuurt de uitnodiging; true als de mail is afgeleverd. sendMail gooit nooit. */
export async function stuurUitnodiging(o: { naam: string; email: string; door: string; link: string }): Promise<boolean> {
  return (await sendMail(uitnodigingMail(o))).delivered;
}

/** Wachtwoord vergeten: `link` is het adres van het beheer met ?herstel=<token>. */
export function herstelMail(o: { naam: string; email: string; link: string }): MailInput {
  const naam = regel(o.naam);
  const tekst = "Er is een nieuw wachtwoord aangevraagd voor het beheer van de SmileyApp-website.";
  const slot = `De link werkt ${HERSTEL_MINUTEN} minuten en één keer. Heb je dit niet aangevraagd, dan kun je deze mail weggooien: je wachtwoord blijft zoals het is.`;
  return {
    to: o.email,
    subject: "Kies een nieuw wachtwoord voor het beheer van SmileyApp",
    text: `Hallo ${naam},\n\n${tekst} Kies een nieuw wachtwoord via deze link:\n${o.link}\n\n${slot}`,
    html: omlijsting(
      "Nieuw wachtwoord kiezen",
      `${alinea(`Hallo ${esc(naam)}, ${esc(tekst)} Klik op de knop om een nieuw wachtwoord te kiezen.`)}
${knop(o.link, "Kies een nieuw wachtwoord")}
${alinea(esc(slot))}
<p style="margin:0;font-size:12px;line-height:1.5;color:${GRIJS}">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${esc(o.link)}</span></p>`,
    ),
    kind: "smileyapp-wachtwoord",
  };
}

/** Verstuurt de herstellink; true als de mail is afgeleverd. sendMail gooit nooit. */
export async function stuurHerstel(o: { naam: string; email: string; link: string }): Promise<boolean> {
  return (await sendMail(herstelMail(o))).delivered;
}

const SOORT_TEKST = { demo: "demo-aanvraag", partner: "partner-aanmelding" } as const;

/** De melding aan een beheerder: alleen het bedrijf, de gegevens van de aanvrager staan in het beheer. */
export function meldingMail(o: { to: string; soort: "demo" | "partner"; bedrijf: string; beheer: string }): MailInput {
  const wat = SOORT_TEKST[o.soort];
  const bedrijf = regel(o.bedrijf) || "een bezoeker";
  const tab = o.soort === "demo" ? "demo" : "partners";
  const link = `${o.beheer}#${tab}`;
  const uitleg = "De gegevens staan in het beheer. Daar kun je bellen of mailen, de status bijhouden en een notitie maken.";
  return {
    to: o.to,
    subject: `Nieuwe ${wat} van ${bedrijf}`,
    text: `Er is een nieuwe ${wat} binnengekomen van ${bedrijf}.\n\n${uitleg}\n\nNaar het beheer:\n${link}`,
    html: omlijsting(`Nieuwe ${wat}`, `${alinea(`Er is een nieuwe ${esc(wat)} binnengekomen van <strong style="color:${INKT}">${esc(bedrijf)}</strong>.`)}${alinea(esc(uitleg))}${knop(link, "Open het beheer")}`),
    kind: "smileyapp-melding",
  };
}

/** Meldt een nieuwe aanvraag aan alle beheerders; geeft terug hoeveel mails zijn afgeleverd. */
export async function stuurMelding(o: { soort: "demo" | "partner"; bedrijf: string; beheer: string; ontvangers: readonly string[] }): Promise<number> {
  const uitslag = await Promise.all(o.ontvangers.map((to) => sendMail(meldingMail({ to, soort: o.soort, bedrijf: o.bedrijf, beheer: o.beheer }))));
  return uitslag.filter((u) => u.delivered).length;
}

// ---- deel 6a: de demo-afspraak uit de agenda en de wekelijkse mail ---------------

/** De melding aan een beheerder als de aanvrager meteen een tijd uit de agenda koos: het bedrijf en de tijd, verder niets. */
export function afspraakMeldingMail(o: { to: string; bedrijf: string; beheer: string; start: string }): MailInput {
  const bedrijf = regel(o.bedrijf) || "een bezoeker";
  const wanneer = afspraakTekst(o.start);
  const link = `${o.beheer}#agenda`;
  const uitleg = "De tijd is in de agenda geboekt en de aanvraag staat op Demo gepland. De gegevens van de aanvrager staan in het beheer; daar kun je de afspraak ook annuleren.";
  return {
    to: o.to,
    subject: `Demo gepland met ${bedrijf}: ${wanneer}`,
    text: `${bedrijf} heeft een demo gepland op ${wanneer} (Nederlandse tijd, ${DEMO_MINUTEN} minuten).\n\n${uitleg}\n\nNaar de agenda:\n${link}`,
    html: omlijsting(
      "Demo gepland",
      `${alinea(`<strong style="color:${INKT}">${esc(bedrijf)}</strong> heeft een demo gepland op <strong style="color:${INKT}">${esc(wanneer)}</strong> (Nederlandse tijd, ${DEMO_MINUTEN} minuten).`)}${alinea(esc(uitleg))}${knop(link, "Open de agenda")}`,
    ),
    kind: "smileyapp-melding",
  };
}

/** Meldt een geboekte demo aan alle beheerders; geeft terug hoeveel mails zijn afgeleverd. */
export async function stuurAfspraakMelding(o: { bedrijf: string; beheer: string; start: string; ontvangers: readonly string[] }): Promise<number> {
  const uitslag = await Promise.all(o.ontvangers.map((to) => sendMail(afspraakMeldingMail({ to, bedrijf: o.bedrijf, beheer: o.beheer, start: o.start }))));
  return uitslag.filter((u) => u.delivered).length;
}

type MailTaal = "nl" | "en" | "de";

/** De bevestiging aan de aanvrager, in de taal van het formulier. {moment}, {minuten} en {mail} worden ingevuld. Bewust zonder de naam: het adres is niet gecontroleerd, dus er gaat geen vrije tekst van de bezoeker naar toe. */
const BEVESTIGING: Record<MailTaal, { onderwerp: string; kop: string; tekst: string; bijlage: string; kanNiet: string; titel: string }> = {
  nl: {
    onderwerp: "Je demo van Smileyapp: {moment}",
    kop: "Je demo staat gepland",
    tekst: "Hallo, je demo van Smileyapp staat gepland op {moment} (Nederlandse tijd). De demo duurt {minuten} minuten.",
    bijlage: "In de bijlage staat de afspraak voor je agenda.",
    kanNiet: "Kun je toch niet? Mail naar {mail}.",
    titel: "Demo Smileyapp",
  },
  en: {
    onderwerp: "Your Smileyapp demo: {moment}",
    kop: "Your demo is scheduled",
    tekst: "Hello, your Smileyapp demo is scheduled for {moment} (Dutch time). The demo takes {minuten} minutes.",
    bijlage: "The attachment contains the appointment for your calendar.",
    kanNiet: "Can't make it after all? Email {mail}.",
    titel: "Smileyapp demo",
  },
  de: {
    onderwerp: "Ihre Smileyapp-Demo: {moment}",
    kop: "Ihre Demo ist geplant",
    tekst: "Guten Tag, Ihre Smileyapp-Demo ist geplant für {moment} (niederländische Zeit). Die Demo dauert {minuten} Minuten.",
    bijlage: "Im Anhang finden Sie den Termin für Ihren Kalender.",
    kanNiet: "Passt es doch nicht? Schreiben Sie eine E-Mail an {mail}.",
    titel: "Smileyapp-Demo",
  },
};

/**
 * De bevestiging aan de aanvrager die zelf een tijd koos. `moment` is de tijd in Nederlandse tijd, al in de taal
 * van de lezer (afspraakInTaal). De bijlage is een agendabestand met begin en eind in UTC (met Z).
 */
export function bevestigingMail(o: { to: string; naam: string; start: string; moment: string; taal?: MailTaal | undefined; tijd: string; contact: string; nu: Date }): MailInput {
  const taal = o.taal ?? "nl";
  const t = BEVESTIGING[taal];
  const waarden = { naam: regel(o.naam), moment: o.moment, minuten: DEMO_MINUTEN, mail: o.contact };
  const tekst = vul(t.tekst, waarden);
  const kanNiet = vul(t.kanNiet, waarden);
  return {
    to: o.to,
    subject: vul(t.onderwerp, waarden),
    text: `${tekst}\n\n${t.bijlage}\n\n${kanNiet}`,
    html: omlijsting(t.kop, `${alinea(esc(tekst))}${alinea(esc(t.bijlage))}${alinea(esc(kanNiet))}`, { buiten: true, taal }),
    kind: "smileyapp-afspraak",
    attachments: [
      {
        filename: "smileyapp-demo.ics",
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
        content: afspraakIcs({ uid: `demo-${o.tijd}@${SUBDOMEIN_HOST}`, start: o.start, nu: o.nu, titel: t.titel, omschrijving: kanNiet }),
      },
    ],
  };
}

/** Verstuurt de bevestiging; true als de mail is afgeleverd. sendMail gooit nooit. */
export async function stuurBevestiging(o: Parameters<typeof bevestigingMail>[0]): Promise<boolean> {
  return (await sendMail(bevestigingMail(o))).delivered;
}

const korteDag = (iso: string) => dagTekst(iso);
/** null: de teller was niet te lezen. Dan staat er geen getal: liever niets dan een verzonnen nul. */
const aantal = (n: number | null) => (n === null ? "niet te tellen" : String(n));

/**
 * De wekelijkse mail aan een beheerder: alleen aantallen, geen namen, adressen of berichten. `voorbeeld`: de
 * beheerder vroeg er zelf om met de knop in het beheer; dan staat dat erbij.
 */
export function weekMail(o: { to: string; week: WeekCijfers; beheer: string; voorbeeld?: boolean }): MailInput {
  const w = o.week;
  const periode = `${korteDag(w.van)} tot en met ${korteDag(w.totEnMet)}`;
  const rijen: [string, string][] = [
    ["Paginaweergaven", aantal(w.bezoeken)],
    ["Nieuwe demo-aanvragen", String(w.aanvragen.demo)],
    ["Nieuwe partner-aanmeldingen", String(w.aanvragen.partner)],
    ["Chatgesprekken", aantal(w.chats)],
    ["Demo's geboekt via de agenda", String(w.demos)],
  ];
  const open =
    w.open === 0
      ? `Er staan geen aanvragen langer dan ${OPEN_NA_DAGEN} dagen op Nieuw.`
      : w.open === 1
        ? `Er staat 1 aanvraag langer dan ${OPEN_NA_DAGEN} dagen op Nieuw. Bel of mail en zet de status daarna om.`
        : `Er staan ${w.open} aanvragen langer dan ${OPEN_NA_DAGEN} dagen op Nieuw. Bel of mail en zet de status daarna om.`;
  const slot = "Deze mail komt elke maandag. In het beheer, bij Overzicht, zet een beheerder hem uit.";
  const vooraf = o.voorbeeld ? "Dit is een voorbeeld dat je zelf hebt aangevraagd in het beheer.\n\n" : "";
  return {
    to: o.to,
    subject: `${o.voorbeeld ? "Voorbeeld: " : ""}SmileyApp, het overzicht van de week (${periode})`,
    text: `${vooraf}Het overzicht van ${periode}.\n\n${rijen.map(([label, n]) => `${label}: ${n}`).join("\n")}\n\n${open}\n\nNaar het beheer:\n${o.beheer}\n\n${slot}`,
    html: omlijsting(
      "Het overzicht van de week",
      `${o.voorbeeld ? alinea("Dit is een voorbeeld dat je zelf hebt aangevraagd in het beheer.") : ""}${alinea(esc(`De cijfers van ${periode}.`))}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse">${rijen
        .map(([label, n]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #E3EDE7;font-size:15px;color:${GRIJS}">${esc(label)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #E3EDE7;font-size:16px;font-weight:700;color:${INKT}">${esc(n)}</td></tr>`)
        .join("")}</table>
${alinea(`<strong style="color:${INKT}">${esc(open)}</strong>`)}${knop(o.beheer, "Open het beheer")}${alinea(esc(slot))}`,
    ),
    kind: "smileyapp-weekmail",
  };
}