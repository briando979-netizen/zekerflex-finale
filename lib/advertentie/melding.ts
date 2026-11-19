import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isReservedTestAddress, mailButton, mailShell, sendMail } from "@/lib/mail";
import { meldGebeurtenis } from "@/lib/ops/melder";
import { CONTACTS } from "@/lib/seo";
import { BEWAAR_DAGEN, ONTWERPEN, PAKKET_NAAM, prijsTekst, type Advertentie, type Prijzen } from "@/lib/advertentie/regels";

// De berichten rond een advertentie op maat. Aan de eigenaar: een regel in de melder (lib/ops/melder.ts, zonder naam of
// adres) en een mail aan sales met de gegevens. Een melding naar een intern adres gaat altijd echt weg, dus bij een
// testadres van de aanvrager slaan we beide over (AGENTS.md). Aan de klant: na vrijgave de link naar zijn pagina.
// Nooit gooien: de aanvraag of de vrijgave staat al.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");
const ontwerpNaam = (nr: number) => ONTWERPEN.find((o) => o.nr === nr)?.naam ?? String(nr);

export async function meldAanvraag(ad: Advertentie, prijzen: Prijzen): Promise<void> {
  const a = ad.aanvraag;
  if (!a || isReservedTestAddress(a.email)) return;
  const keuze = `${PAKKET_NAAM[a.pakket]} (${prijsTekst(prijzen, a.pakket)}), aangeklikt: ontwerp ${a.ontwerp} (${ontwerpNaam(a.ontwerp)})`;
  await meldGebeurtenis({ soort: "marketing", titel: "Advertentie op maat aangevraagd", detail: PAKKET_NAAM[a.pakket], url: "/admin/advertentie-op-maat" });
  await sendMail({
    to: CONTACTS.sales,
    replyTo: a.email,
    kind: "advertentie-aanvraag",
    subject: `Advertentie op maat: ${ad.invoer.bedrijf} wil hem hebben`,
    text: `${ad.invoer.bedrijf} vroeg een advertentie op maat aan.\n\nKeuze: ${keuze}\nNaam: ${a.naam}\nE-mail: ${a.email}\n${a.telefoon ? `Telefoon: ${a.telefoon}\n` : ""}\nStuur een betaalverzoek en klik daarna op Vrijgeven: ${basis()}/admin/advertentie-op-maat`,
    html: mailShell(
      "Advertentie op maat: aanvraag",
      `<p style="margin:0 0 4px"><strong>${esc(ad.invoer.bedrijf)}</strong></p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">${esc(a.naam)} · ${esc(a.email)}${a.telefoon ? ` · ${esc(a.telefoon)}` : ""}</p>
       <p style="margin:0 0 12px;font-size:14px;color:#17211C"><strong>Keuze:</strong> ${esc(keuze)}</p>
       <p style="margin:0 0 12px;font-size:14px;color:#3C4A42">Stuur een betaalverzoek en klik daarna op Vrijgeven. De klant krijgt dan vanzelf de link naar de schone bestanden.</p>
       <p style="margin:0">${mailButton(`${basis()}/admin/advertentie-op-maat`, "Open in Beheer")}</p>`,
    ),
  }).catch((e) => logger.warn("advertentie op maat: melding aan sales mislukt", { error: (e as Error).message }));
}

/** Na vrijgave: de klant krijgt de link naar zijn pagina, waar de schone bestanden nu te downloaden zijn. Geeft terug of de mail wegging. */
export async function stuurVrijgave(ad: Advertentie): Promise<boolean> {
  const a = ad.aanvraag;
  if (!a) return false;
  const link = `${basis()}/advertentie-op-maat/${ad.id}`;
  const wat = a.pakket === "alle" ? "alle drie de ontwerpen" : `het ontwerp "${ontwerpNaam(a.ontwerp)}"`;
  try {
    const r = await sendMail({
      to: a.email,
      from: env.MAIL_FROM,
      replyTo: CONTACTS.sales,
      kind: "advertentie-vrijgave",
      subject: `Je advertentie van ${ad.invoer.bedrijf} staat klaar`,
      text: `Hoi ${a.naam},\n\nBedankt voor je betaling. Je advertentie staat klaar: ${wat}, zonder watermerk, in drie formaten (vierkant, verhaal en liggend).\n\nDownload ze hier: ${link}\n\nDe link blijft ${BEWAAR_DAGEN} dagen werken. Bewaar de bestanden dus op je eigen computer of telefoon.\n\nGroet,\nZekerFlex`,
      html: mailShell(
        "Je advertentie staat klaar",
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${esc(a.naam)}, bedankt voor je betaling. Je advertentie van <strong>${esc(ad.invoer.bedrijf)}</strong> staat klaar: ${esc(wat)}, zonder watermerk, in drie formaten (vierkant, verhaal en liggend).</p>
         <p style="margin:0 0 14px">${mailButton(link, "Download je advertentie")}</p>
         <p style="margin:0;font-size:13px;line-height:1.6;color:#5B6861">De link blijft ${BEWAAR_DAGEN} dagen werken. Bewaar de bestanden dus op je eigen computer of telefoon.</p>`,
      ),
    });
    return Boolean(r?.delivered);
  } catch (e) {
    logger.warn("advertentie op maat: vrijgavemail mislukt", { error: (e as Error).message });
    return false;
  }
}
