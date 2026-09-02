import { env } from "@/lib/env";
import { mailShell, mailButton, type MailInput } from "@/lib/mail";

function base(): string {
  return env.APP_BASE_URL.replace(/\/+$/, "");
}

export function confirmUrl(token: string): string {
  return `${base()}/nieuwsbrief/bevestigen?token=${encodeURIComponent(token)}`;
}
/** Human-facing unsubscribe page (link in the mail body). */
export function unsubscribeUrl(token: string): string {
  return `${base()}/nieuwsbrief/afmelden?token=${encodeURIComponent(token)}`;
}
/** RFC 8058 one-click endpoint (List-Unsubscribe header). */
export function unsubscribeApiUrl(token: string): string {
  return `${base()}/api/nieuwsbrief/afmelden?token=${encodeURIComponent(token)}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Double opt-in confirmation. */
export function newsletterConfirmEmail(email: string, token: string): MailInput {
  const link = confirmUrl(token);
  return {
    to: email,
    from: env.MAIL_NIEUWSBRIEF_FROM,
    replyTo: env.MAIL_REPLY_TO,
    kind: "nieuwsbrief-bevestiging",
    subject: "Bevestig je inschrijving voor de ZekerFlex-nieuwsbrief",
    text: `Je hebt je aangemeld voor de ZekerFlex-nieuwsbrief.\n\nBevestig je inschrijving via deze link:\n${link}\n\nHeb je dit niet aangevraagd? Dan hoef je niets te doen — zonder bevestiging ontvang je geen mail.`,
    html: mailShell(
      "Nog één klik",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Je hebt je aangemeld voor de ZekerFlex-nieuwsbrief. Bevestig je inschrijving om hem te ontvangen.</p>
       <p style="margin:0 0 20px">${mailButton(link, "Inschrijving bevestigen")}</p>
       <p style="margin:0;font-size:12px;color:#667469">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${link}</span></p>
       <p style="margin:16px 0 0;font-size:12px;color:#667469">Heb je dit niet aangevraagd? Negeer deze mail — zonder bevestiging ontvang je niets.</p>`,
    ),
  };
}

/** One issue of the newsletter to one confirmed subscriber. */
export function newsletterBroadcastEmail(
  email: string,
  token: string,
  subject: string,
  bodyText: string,
): MailInput {
  const unsub = unsubscribeUrl(token);
  const unsubApi = unsubscribeApiUrl(token);
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#3C4A42">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return {
    to: email,
    from: env.MAIL_NIEUWSBRIEF_FROM,
    replyTo: env.MAIL_REPLY_TO,
    kind: "nieuwsbrief",
    listUnsubscribe: unsubApi,
    subject,
    text: `${bodyText}\n\n—\nJe ontvangt deze mail omdat je je hebt ingeschreven voor de ZekerFlex-nieuwsbrief.\nAfmelden: ${unsub}`,
    html: mailShell(
      subject,
      `${paragraphs}
       <p style="margin:22px 0 0;border-top:1px solid #E6E7E1;padding-top:14px;font-size:12px;color:#667469">
       Je ontvangt deze mail omdat je je hebt ingeschreven voor de ZekerFlex-nieuwsbrief.
       <a href="${unsub}" style="color:#667469">Afmelden</a>.
       </p>`,
    ),
  };
}
