import type { HorecaReservering, HorecaZaak } from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendMail, type MailInput } from "@/lib/mail";
import { tekenMet } from "@/lib/horeca/link";

// ---------------------------------------------------------------------------
// Mails van het horeca-pakket: de bevestiging aan de gast (met een link om
// zelf te annuleren) en seintjes aan de zaak. Verstuurd via ZekerFlex namens
// de zaak; een antwoord van de gast gaat naar de zaak (replyTo).
// ---------------------------------------------------------------------------

type Zaak = Pick<HorecaZaak, "naam" | "slug" | "kleur" | "telefoon" | "email" | "adres" | "plaats">;
type Res = Pick<HorecaReservering, "id" | "datum" | "tijd" | "personen" | "naam" | "email" | "telefoon" | "opmerking">;

const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const kleurVan = (z: Zaak) => (/^#[0-9a-fA-F]{6}$/.test(z.kleur) ? z.kleur : "#0A120E");
const voornaam = (naam: string) => naam.trim().split(/\s+/)[0] || naam;
const dag = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const wanneer = (r: Res) => `${dag(r.datum)} om ${r.tijd} uur`;
const personen = (n: number) => `${n} ${n === 1 ? "persoon" : "personen"}`;

/** De link waarmee de gast zelf annuleert (ondertekend, alleen voor deze reservering). */
export const annuleerUrl = (z: Pick<HorecaZaak, "slug">, reserveringId: string) => `${basis()}/horeca/${z.slug}/annuleren/${tekenMet(env.AUTH_SECRET, "annuleer", reserveringId)}`;

function omlijsting(z: Zaak, titel: string, inhoud: string): string {
  const contact = [z.telefoon, z.email].filter(Boolean).map(esc).join(" · ");
  const adres = [z.adres, z.plaats].filter(Boolean).map(esc).join(", ");
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#F4F5F1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#17211C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E6E7E1">
<tr><td style="background:${kleurVan(z)};padding:18px 28px;color:#fff;font-weight:700;font-size:18px">${esc(z.naam)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px;color:#17211C">${esc(titel)}</h1>
${inhoud}
</td></tr>
<tr><td style="padding:16px 28px;background:#F4F5F1;color:#667469;font-size:12px">${esc(z.naam)}${adres ? ` · ${adres}` : ""}${contact ? `<br>${contact}` : ""}<br>Verstuurd via ZekerFlex namens ${esc(z.naam)}.</td></tr>
</table></td></tr></table></body></html>`;
}

const alinea = (html: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${html}</p>`;
const knop = (z: Zaak, href: string, label: string) =>
  `<p style="margin:0 0 20px"><a href="${esc(href)}" style="display:inline-block;background:${kleurVan(z)};color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600;font-size:14px">${esc(label)}</a></p>`;

const bericht = (z: Zaak, to: string, subject: string, text: string, html: string, replyTo?: string): MailInput => ({
  to,
  subject,
  text: `${text}\n\n${z.naam}${z.telefoon ? ` · ${z.telefoon}` : ""}`,
  html,
  kind: "horeca",
  ...(replyTo ? { replyTo } : {}),
});

/** Aan de gast: je tafel staat klaar, met de link om zelf te annuleren. */
export function bevestigingGast(z: Zaak, r: Res): MailInput {
  const link = annuleerUrl(z, r.id);
  return bericht(
    z,
    r.email,
    `Je reservering bij ${z.naam}: ${wanneer(r)}`,
    `Hoi ${voornaam(r.naam)},\n\nJe tafel bij ${z.naam} staat klaar op ${wanneer(r)} voor ${personen(r.personen)}.${r.opmerking ? `\nJe opmerking: ${r.opmerking}` : ""}\n\nKun je toch niet? Annuleer hier: ${link}`,
    omlijsting(
      z,
      "Je tafel staat klaar",
      `${alinea(`Hoi ${esc(voornaam(r.naam))}, je tafel bij ${esc(z.naam)} staat klaar op <strong>${esc(wanneer(r))}</strong> voor ${esc(personen(r.personen))}.`)}
       ${r.opmerking ? alinea(`Je opmerking: ${esc(r.opmerking)}`) : ""}
       ${alinea("Kun je toch niet? Laat het ons dan even weten, zodat een andere gast de tafel kan krijgen.")}
       ${knop(z, link, "Reservering annuleren")}`,
    ),
    z.email || undefined,
  );
}

/** Aan de zaak: er is online gereserveerd (alleen als de zaak een e-mailadres heeft). */
export function nieuweReserveringZaak(z: Zaak, r: Res): MailInput | null {
  if (!z.email) return null;
  const regels = [`${wanneer(r)} · ${personen(r.personen)}`, `${r.naam} · ${r.telefoon} · ${r.email}`, r.opmerking ? `Opmerking: ${r.opmerking}` : ""].filter(Boolean);
  return bericht(
    z,
    z.email,
    `Nieuwe reservering: ${r.naam}, ${wanneer(r)}`,
    `Er is online gereserveerd:\n\n${regels.join("\n")}\n\nAlle reserveringen: ${basis()}/werkgever/horeca`,
    omlijsting(z, "Nieuwe reservering", `${regels.map((x) => alinea(esc(x))).join("")}${knop(z, `${basis()}/werkgever/horeca`, "Naar het reserveringsboek")}`),
    r.email,
  );
}

/** Aan de zaak: de gast heeft zelf geannuleerd. */
export function geannuleerdZaak(z: Zaak, r: Res): MailInput | null {
  if (!z.email) return null;
  return bericht(
    z,
    z.email,
    `Geannuleerd: ${r.naam}, ${wanneer(r)}`,
    `${r.naam} heeft de reservering van ${wanneer(r)} (${personen(r.personen)}) zelf geannuleerd. De tafel is weer vrij.`,
    omlijsting(z, "Reservering geannuleerd", alinea(`${esc(r.naam)} heeft de reservering van <strong>${esc(wanneer(r))}</strong> (${esc(personen(r.personen))}) zelf geannuleerd. De tafel is weer vrij.`)),
    r.email,
  );
}

export async function verstuur(m: MailInput | null): Promise<boolean> {
  if (!m || !m.to) return false;
  try {
    return (await sendMail(m)).delivered;
  } catch (err) {
    logger.warn("horeca: mail niet verstuurd", { subject: m.subject, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
