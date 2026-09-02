import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendViaSmtp, type SmtpConfig } from "@/lib/mail/smtp";
import { saveSentMessage, type SentRecord } from "@/lib/mail/store";
import { EMAIL_LOGO_PNG_BASE64 } from "@/lib/mail/logo";
import { categoryBySlug, isAutomatedKind, isOptionalCategory, mailCategoryForKind } from "@/lib/mail/categories";
import { getMailPrefs, mailAllowed } from "@/lib/mail/prefs";

// ---- brand logo (inline CID image in every HTML mail) ------------------------
const LOGO_CID = "zekerflex-logo";

function logoBase64(): string | null {
  const raw = EMAIL_LOGO_PNG_BASE64?.trim();
  if (!raw) return null;
  return (raw.match(/.{1,76}/g) ?? []).join("\r\n");
}

// ---------------------------------------------------------------------------
// Outbound e-mail. Every message is captured in the local mailbox
// (storage/mail, shown at /admin/mail). When SMTP_HOST is set it is ALSO
// delivered for real. sendMail never throws — a mail failure must never block
// registration or verification.
//
// Does not touch the database, Redis, sessions, RBAC or the audit trail.
// ---------------------------------------------------------------------------

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** short tag for the mailbox ("verification", "welcome", "test") */
  kind?: string;
  /** override the From address (default env.MAIL_FROM); must be a ZekerFlex-domain address */
  from?: string;
  /** override the Reply-To address (default env.MAIL_REPLY_TO) */
  replyTo?: string;
  /** one-click unsubscribe URL — emits List-Unsubscribe headers (bulk mail only) */
  listUnsubscribe?: string;
}

export interface MailResult {
  id: string;
  delivered: boolean;
  transport: "smtp" | "mailbox";
  error?: string;
  /** set when the recipient has unsubscribed from this optional category */
  suppressed?: string;
}

export function smtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_HOST.trim());
}

export function smtpConfig(): SmtpConfig | null {
  if (!smtpConfigured()) return null;
  return {
    host: env.SMTP_HOST!.trim(),
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
    ...(env.SMTP_PASS ? { pass: env.SMTP_PASS } : {}),
    timeout: env.SMTP_TIMEOUT_S,
    clientName: hostFromUrl(env.APP_BASE_URL),
  };
}

function hostFromUrl(u: string): string {
  try {
    return new URL(u).hostname || "zekerflex.com";
  } catch {
    return "zekerflex.com";
  }
}

function fromHeader(override?: string): { addr: string; header: string } {
  const addr = (override && override.trim()) || env.MAIL_FROM;
  const name = env.MAIL_FROM_NAME;
  return { addr, header: name ? `${encodeHeaderWord(name)} <${addr}>` : addr };
}

function encodeHeaderWord(s: string): string {
  // RFC 2047 for any non-ASCII in a header display name.
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function buildRaw(input: MailInput, from: string, messageId: string): string {
  const date = new Date().toUTCString();
  const alt = `zfa_${randomUUID().replace(/-/g, "")}`;
  const rel = `zfr_${randomUUID().replace(/-/g, "")}`;
  const replyTo = (input.replyTo && input.replyTo.trim()) || env.MAIL_REPLY_TO;
  const unsub = input.listUnsubscribe?.trim();
  const headersCommon = [
    `From: ${from}`,
    `To: ${input.to}`,
    ...(replyTo && replyTo !== from ? [`Reply-To: ${replyTo}`] : []),
    ...(unsub
      ? [`List-Unsubscribe: <${unsub}>`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`]
      : []),
    `Subject: ${encodeHeaderWord(input.subject)}`,
    `Date: ${date}`,
    `Message-ID: <${messageId}>`,
    `MIME-Version: 1.0`,
    `X-ZekerFlex-Kind: ${input.kind ?? "generic"}`,
  ];

  if (input.html) {
    const altPart = [
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      `--${alt}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      "",
      wrap64(input.text),
      `--${alt}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      "",
      wrap64(input.html),
      `--${alt}--`,
    ];

    const logo = logoBase64();
    if (logo) {
      // multipart/related so the HTML can reference the logo via cid:
      return [
        ...headersCommon,
        `Content-Type: multipart/related; boundary="${rel}"; type="multipart/alternative"`,
        "",
        `--${rel}`,
        ...altPart,
        "",
        `--${rel}`,
        `Content-Type: image/png; name="zekerflex-logo.png"`,
        `Content-Transfer-Encoding: base64`,
        `Content-ID: <${LOGO_CID}>`,
        `Content-Disposition: inline; filename="zekerflex-logo.png"`,
        "",
        logo,
        `--${rel}--`,
        "",
      ].join("\r\n");
    }

    return [...headersCommon, ...altPart, ""].join("\r\n");
  }
  return [
    ...headersCommon,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    "",
    wrap64(input.text),
    "",
  ].join("\r\n");
}

function wrap64(s: string): string {
  return (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const id = randomUUID().slice(0, 12);

  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const category = mailCategoryForKind(input.kind);
  const automated = isAutomatedKind(input.kind);
  const footerLines: string[] = [];
  let suppressed: string | undefined;

  // Optional-category mail: honour the recipient's unsubscribe.
  if (isOptionalCategory(category)) {
    const allowed = await mailAllowed(input.to, category).catch(() => true);
    if (!allowed) {
      suppressed = `afgemeld voor "${categoryBySlug(category)?.label ?? category}"`;
    } else if (!input.listUnsubscribe) {
      // Mails that already carry their own unsubscribe (the newsletter) are
      // only gated above; we don't add a second footer.
      try {
        const prefs = await getMailPrefs(input.to);
        const one = `${base}/api/mail/afmelden?token=${encodeURIComponent(prefs.token)}&c=${category}`;
        const page = `${base}/mail/voorkeuren?token=${encodeURIComponent(prefs.token)}`;
        input = { ...input, listUnsubscribe: one };
        footerLines.push(
          `Je ontvangt deze e-mail als "${categoryBySlug(category)?.label ?? category}". Afmelden of voorkeuren wijzigen: ${page}`,
        );
      } catch {
        /* prefs unavailable — send anyway, without the footer */
      }
    }
  }

  // Automated mail (wachtwoord, verificatie, facturen, meldingen, …): make
  // clear that replies are not read, and don't route replies to a person.
  if (automated && !suppressed) {
    input = { ...input, replyTo: env.MAIL_FROM };
    footerLines.unshift(
      "Dit is een automatisch bericht van ZekerFlex. Antwoorden op deze e-mail worden niet gelezen. Hulp nodig? Mail support@zekerflex.com of kijk op zekerflex.com.",
    );
  }

  if (footerLines.length && !suppressed) {
    input = {
      ...input,
      text: `${input.text}\n\n—\n${footerLines.join("\n")}`,
      ...(input.html
        ? {
            html: input.html.replace(
              /<\/body>/i,
              `<div style="max-width:520px;margin:14px auto 0;padding:0 16px 8px;font-family:Segoe UI,Arial,sans-serif;font-size:11px;line-height:1.5;color:#8A938C;text-align:center">${footerLines
                .map((l) =>
                  l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
                    /(https?:\/\/[^\s]+)/g,
                    '<a href="$1" style="color:#8A938C">voorkeuren wijzigen</a>',
                  ),
                )
                .join("<br>")}</div></body>`,
            ),
          }
        : {}),
    };
  }

  const { addr, header } = fromHeader(input.from);
  const messageId = `${id}@${hostFromUrl(env.APP_BASE_URL)}`;
  const raw = buildRaw(input, header, messageId);

  let delivered = false;
  let transport: "smtp" | "mailbox" = "mailbox";
  let error: string | undefined;

  const cfg = smtpConfig();
  if (cfg && !suppressed) {
    transport = "smtp";
    try {
      await sendViaSmtp(cfg, { from: addr, to: [input.to], raw });
      delivered = true;
    } catch (err) {
      error = (err as Error).message;
      logger.warn("smtp delivery failed - mail kept in local mailbox", { to: input.to, error });
    }
  }

  const rec: SentRecord = {
    id,
    at: new Date().toISOString(),
    from: addr,
    to: [input.to],
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    kind: input.kind ?? "generic",
    delivered,
    transport,
    ...(error ? { error } : {}),
    ...(suppressed ? { suppressed } : {}),
  };
  await saveSentMessage(rec).catch((e) =>
    logger.error("mailbox write failed", { error: (e as Error).message }),
  );

  logger.info("mail sent", { to: input.to, kind: rec.kind, delivered, transport, ...(suppressed ? { suppressed } : {}) });
  return { id, delivered, transport, ...(error ? { error } : {}), ...(suppressed ? { suppressed } : {}) };
}

// ---- templates ----------------------------------------------------------

const BRAND = "#0E5C4A";

export function mailShell(title: string, bodyHtml: string): string {
  return shell(title, bodyHtml);
}
export function mailButton(href: string, label: string): string {
  return button(href, label);
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#F4F5F1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#17211C">
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
ZekerFlex — zeker van je werk. Deze e-mail is verstuurd vanaf de ZekerFlex Sovereign Box.
</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:600;font-size:14px">${label}</a>`;
}

export function verificationEmail(fullName: string, link: string, code?: string): MailInput {
  const first = fullName.split(" ")[0] || fullName;
  const codeText = code ? `\n\nOf voer deze code in op de bevestigingspagina: ${code}` : "";
  const codeHtml = code
    ? `<p style="margin:0 0 8px;font-size:13px;color:#667469">Of voer deze code in op de bevestigingspagina:</p>
       <p style="margin:0 0 20px;font-size:30px;font-weight:700;letter-spacing:6px;color:#0E5C4A;font-family:Consolas,Menlo,monospace">${code}</p>`
    : "";
  return {
    to: "",
    subject: `Je ZekerFlex-bevestigingscode${code ? `: ${code}` : ""}`,
    kind: "verification",
    text: `Hoi ${first},\n\nBevestig je e-mailadres om je ZekerFlex-account te activeren:\n${link}${codeText}\n\nDeze code en link zijn 24 uur geldig. Heb je dit niet aangevraagd? Dan kun je deze mail negeren.`,
    html: shell(
      "Bevestig je e-mailadres",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${first}, welkom bij ZekerFlex. Klik op de knop om je account te activeren.</p>
       <p style="margin:0 0 20px">${button(link, "E-mailadres bevestigen")}</p>
       ${codeHtml}
       <p style="margin:0;font-size:12px;color:#667469">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${link}</span></p>
       <p style="margin:16px 0 0;font-size:12px;color:#667469">De code en link zijn 24 uur geldig.</p>`,
    ),
  };
}

export function welcomeEmail(fullName: string, type: "freelancer" | "bedrijf", appUrl: string): MailInput {
  const first = fullName.split(" ")[0] || fullName;
  const next =
    type === "bedrijf"
      ? "Rond de onboarding van je organisatie af (KVK + eerste vestiging) en zet je eerste dienst uit."
      : "Rond je verificatie af (KVK + identiteit) en bekijk de eerste klussen die bij je passen.";
  return {
    to: "",
    subject: "Welkom bij ZekerFlex",
    kind: "welcome",
    text: `Hoi ${first},\n\nJe ZekerFlex-account is aangemaakt.\n\nVolgende stap: ${next}\n\nInloggen: ${appUrl}/login`,
    html: shell(
      "Welkom bij ZekerFlex",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${first}, je account is aangemaakt. Fijn dat je er bent.</p>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42"><strong>Volgende stap:</strong> ${next}</p>
       <p style="margin:0">${button(`${appUrl}/login`, "Naar ZekerFlex")}</p>`,
    ),
  };
}

export function passwordResetEmail(fullName: string, link: string): MailInput {
  const first = fullName.split(" ")[0] || fullName;
  return {
    to: "",
    subject: "Stel je ZekerFlex-wachtwoord opnieuw in",
    kind: "wachtwoord-reset",
    text: `Hoi ${first},\n\nJe hebt gevraagd om je wachtwoord opnieuw in te stellen. Klik op de link hieronder; hij is 1 uur geldig.\n\n${link}\n\nHeb je dit niet aangevraagd? Dan kun je deze mail negeren — je wachtwoord blijft ongewijzigd.`,
    html: shell(
      "Wachtwoord opnieuw instellen",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${first}, je hebt gevraagd om je wachtwoord opnieuw in te stellen. De link is 1 uur geldig.</p>
       <p style="margin:0 0 20px">${button(link, "Wachtwoord opnieuw instellen")}</p>
       <p style="margin:0;font-size:12px;color:#667469">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${link}</span></p>
       <p style="margin:16px 0 0;font-size:12px;color:#667469">Heb je dit niet aangevraagd? Negeer deze mail — je wachtwoord blijft ongewijzigd.</p>`,
    ),
  };
}
