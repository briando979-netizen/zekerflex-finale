import type { HorecaZaak } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { SimplePdf } from "@/lib/pdf/simple";
import type { MailInput } from "@/lib/mail";
import { leesMet, tekenMet } from "@/lib/horeca/link";
import { btwSpecificatie, METHODE_LABEL, type Methode } from "@/lib/horeca/kassa";
import { bonKop, bonVan, type Bon } from "@/lib/horeca/kassa-server";

// ---------------------------------------------------------------------------
// De bon voor de gast: een ondertekende link (/bon/<token>) die alleen deze ene
// betaalde bon laat zien, als pdf te downloaden of per mail te sturen. De link
// is niet te raden en werkt ook als de site van de zaak offline staat. Er staan
// geen persoonsgegevens op de bon; het e-mailadres van de gast bewaren we niet.
// ---------------------------------------------------------------------------

export const bonToken = (betalingId: string) => tekenMet(env.AUTH_SECRET, "bon", betalingId);

const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");
export const bonUrl = (token: string) => `${basis()}/bon/${token}`;

type Kop = ReturnType<typeof bonKop>;

/** De betaalde bon achter een link, of null (vervalst, niet betaald, verdwenen). */
export async function bonUitToken(token: string | undefined): Promise<{ zaak: HorecaZaak; bon: Bon; kop: Kop } | null> {
  const id = leesMet(env.AUTH_SECRET, "bon", token);
  if (!id) return null;
  const b = await prisma.horecaBetaling.findFirst({ where: { id, status: "BETAALD" }, include: { zaak: true } });
  if (!b) return null;
  return { zaak: b.zaak, bon: await bonVan(b.zaak, b), kop: bonKop(b.zaak) };
}

const bedrag = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const wanneer = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

/** De bon als pdf (A4), met dezelfde inhoud als de kassabon. */
export function bonPdf(kop: Kop, bon: Bon): Buffer {
  const pdf = new SimplePdf().heading(kop.naam, 16);
  const adres = [kop.adres, kop.plaats].filter(Boolean).join(", ");
  if (adres) pdf.line(adres);
  if (kop.telefoon) pdf.line(`Tel. ${kop.telefoon}`);
  const ids = [kop.kvk && `KVK ${kop.kvk}`, kop.btwNummer && `Btw ${kop.btwNummer}`].filter(Boolean).join(" · ");
  if (ids) pdf.line(ids);
  pdf.rule().row(`Bon ${bon.bonNummer ?? ""}`, wanneer(bon.op));
  if (bon.tafel) pdf.row(bon.tafel, "");
  pdf.rule();
  for (const r of bon.regels) pdf.row(`${r.aantal} x ${r.naam}`, bedrag(r.prijsCent * r.aantal));
  pdf.rule().row("Totaal", `€ ${bedrag(bon.bedragCent)}`, { bold: true });
  if (bon.fooiCent > 0) pdf.row("Fooi", `€ ${bedrag(bon.fooiCent)}`);
  pdf.row(`Betaald (${METHODE_LABEL[bon.methode as Methode] ?? bon.methode})`, `€ ${bedrag(bon.bedragCent + bon.fooiCent)}`);
  pdf.rule().section("Btw", 10.5);
  for (const b of btwSpecificatie(bon.regels)) pdf.row(`${b.tarief}% over € ${bedrag(b.exclCent)}`, `€ ${bedrag(b.btwCent)}`);
  if (kop.voettekst) pdf.rule().line(kop.voettekst);
  return pdf.toBuffer();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** De mail aan de gast: korte tekst, een knop naar de bon en de bon als pdf erbij. */
export function bonMail(zaak: HorecaZaak, kop: Kop, bon: Bon, token: string, aan: string): MailInput {
  const link = bonUrl(token);
  const totaal = `€ ${bedrag(bon.bedragCent + bon.fooiCent)}`;
  const kleur = /^#[0-9a-f]{6}$/i.test(zaak.kleur) ? zaak.kleur : "#0A120E";
  return {
    to: aan,
    subject: `Je bon van ${kop.naam}`,
    text: `Bedankt voor je bezoek aan ${kop.naam}.\n\nBon ${bon.bonNummer ?? ""} van ${wanneer(bon.op)}: ${totaal}.\nDe bon staat als pdf in de bijlage en hier online: ${link}`,
    html: `<!doctype html><html lang="nl"><body style="margin:0;background:#F4F5F1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#17211C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E6E7E1">
<tr><td style="background:${kleur};padding:18px 28px;color:#fff;font-weight:700;font-size:18px">${esc(kop.naam)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px">Je bon</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Bedankt voor je bezoek. Bon ${esc(String(bon.bonNummer ?? ""))} van ${esc(wanneer(bon.op))}: <strong>${esc(totaal)}</strong>. De bon staat als pdf in de bijlage.</p>
<p style="margin:0 0 8px"><a href="${esc(link)}" style="display:inline-block;background:${kleur};color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600;font-size:14px">Bon online bekijken</a></p>
</td></tr>
<tr><td style="padding:16px 28px;background:#F4F5F1;color:#667469;font-size:12px">Verstuurd via ZekerFlex namens ${esc(kop.naam)}. We hebben je e-mailadres alleen gebruikt om deze bon te sturen.</td></tr>
</table></td></tr></table></body></html>`,
    kind: "horeca",
    attachments: [{ filename: `bon-${bon.bonNummer ?? "zekerflex"}.pdf`, contentType: "application/pdf", content: bonPdf(kop, bon) }],
    ...(zaak.email ? { replyTo: zaak.email } : {}),
  };
}
