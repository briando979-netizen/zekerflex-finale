// De gedeelde opmaak van de ZekerFlex-mails (kader, knop, escapen), losgemaakt uit lib/mail/index.ts zodat de mails aan werkers in hun eigen
// taal in aparte bestanden kunnen staan (lib/mail/werker/*) zonder een kringverwijzing. Puur: geen kv, geen prisma. Zonder `taal` is het
// kader Nederlands, byte voor byte zoals het was.
import type { Locale } from "@/lib/i18n/config";

/** De taal van een mail aan een werker (de app-taal, lib/i18n/worker-locale.ts). */
export type MailTaal = Locale;

export const BRAND = "#0E5C4A";
export const LOGO_CID = "zekerflex-logo";

/** De regel onderaan elke mail, in de taal van de ontvanger. */
export const MAIL_VOET: Record<MailTaal, string> = {
  nl: "ZekerFlex — zeker van je werk · zekerflex.com",
  en: "ZekerFlex — certainty in your work · zekerflex.com",
  pl: "ZekerFlex — pewność w Twojej pracy · zekerflex.com",
  ro: "ZekerFlex — siguranță în munca ta · zekerflex.com",
  uk: "ZekerFlex — впевненість у твоїй роботі · zekerflex.com",
};

/** Voorbeeldtekst naast het onderwerp in de inbox; onzichtbaar in de mail zelf. */
function preheaderHtml(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#F4F5F1">${escapeHtml(text)}</div>`;
}

export function shell(title: string, bodyHtml: string, preheader?: string, taal: MailTaal = "nl"): string {
  return `<!doctype html><html lang="${taal}"><body style="margin:0;background:#F4F5F1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#17211C">
${preheader ? preheaderHtml(preheader) : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E6E7E1">
<tr><td style="background:${BRAND};padding:18px 28px">
<img src="cid:${LOGO_CID}" width="34" height="34" alt="ZekerFlex" style="vertical-align:middle;border:0;border-radius:8px">
<span style="vertical-align:middle;color:#fff;font-weight:700;font-size:18px;padding-left:10px;letter-spacing:-.2px">ZekerFlex</span>
</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px;color:#17211C">${title}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 28px;background:#F4F5F1;color:#667469;font-size:12px">
${MAIL_VOET[taal]}
</td></tr>
</table></td></tr></table></body></html>`;
}

export function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600;font-size:14px">${label}</a>`;
}

/** Voor HTML-mails: elke waarde die van een bezoeker komt hierdoorheen (naam, bedrijf, e-mail, bericht). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

