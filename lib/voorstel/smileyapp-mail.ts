import { sendMail, type MailInput } from "@/lib/mail";
import { UITNODIGING_DAGEN } from "@/lib/voorstel/smileyapp-account-regels";

// ---------------------------------------------------------------------------
// Mails van het SmileyApp-beheer (19 nov 2026): de uitnodiging om een
// wachtwoord te kiezen, en een korte melding aan de beheerders bij een nieuwe
// demo-aanvraag of partner-aanmelding. In de kleuren van SmileyApp, zonder
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

function omlijsting(titel: string, inhoud: string): string {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:${CREME};font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${INKT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #E3EDE7">
<tr><td style="background:${INKT};padding:20px 28px;color:#ffffff;font-weight:700;font-size:18px">Smileyapp <span style="color:${ZON}">beheer</span></td></tr>
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
