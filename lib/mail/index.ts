import { randomUUID } from "node:crypto";
import type { WerkerHerinnering } from "@/lib/onboarding/herinnering-teksten";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendViaSmtp, type SmtpConfig } from "@/lib/mail/smtp";
import type { ImapConfig } from "@/lib/mail/imap";
import { readSentMessage, saveSentMessage, type SentRecord } from "@/lib/mail/store";
import { EMAIL_LOGO_PNG_BASE64 } from "@/lib/mail/logo";
import { BRAND, LOGO_CID, button, escapeHtml, shell, type MailTaal } from "@/lib/mail/vorm";
import { verificationEmailT } from "@/lib/mail/werker/verificatie";
import { passwordResetEmailT } from "@/lib/mail/werker/wachtwoord";
import { accountDeletionEmailT } from "@/lib/mail/werker/account-wissen";
import { welcomeEmailT } from "@/lib/mail/werker/welkom";
import { idGeverifieerdEmailT } from "@/lib/mail/werker/id-geverifieerd";
import { aanmeldingCompleetEmailT, type AanmeldingCompleetSoort } from "@/lib/mail/werker/aanmelding-compleet";
import { klusVoorstelEmailT } from "@/lib/mail/werker/klusvoorstel";
import { hoursCorrectionProposedEmailT } from "@/lib/mail/werker/geschil";

export { escapeHtml };
import { categoryBySlug, isAutomatedKind, isOptionalCategory, mailCategoryForKind } from "@/lib/mail/categories";
import { getMailPrefs, mailAllowed } from "@/lib/mail/prefs";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { blokBijBounce } from "@/lib/mail/bounce";
import { heeftHardeBounce } from "@/lib/mail/bounce-opslag";
import { ontvangerDomeinen, zonderAdressen } from "@/lib/mail/log-domein";

// ---- brand logo (inline CID image in every HTML mail) ------------------------

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
  /** bijlagen (bijv. de UBL-XML van een e-factuur); niet in de eigen postbus bewaard */
  attachments?: MailAttachment[];
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: string | Buffer;
}

export interface MailResult {
  id: string;
  delivered: boolean;
  transport: "smtp" | "mailbox";
  error?: string;
  /** set when the recipient has unsubscribed from this optional category */
  suppressed?: string;
}

// An address on a domain reserved for tests and documentation (pure, in its own file so code without the mail stack can use it).
export { isReservedTestAddress };

export function smtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_HOST.trim());
}

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|::1)$/i;

/** The mailbox password travels inside this TLS session — so the certificate must be real. */
function verifyTlsFor(host: string): boolean {
  return env.MAIL_TLS_VERIFY && !LOOPBACK.test(host);
}

export function smtpConfig(): SmtpConfig | null {
  if (!smtpConfigured()) return null;
  const host = env.SMTP_HOST!.trim();
  return {
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
    ...(env.SMTP_PASS ? { pass: env.SMTP_PASS } : {}),
    timeout: env.SMTP_TIMEOUT_S,
    clientName: hostFromUrl(env.APP_BASE_URL),
    verifyTls: verifyTlsFor(host),
  };
}

/**
 * IMAP config for the admin "Postvak in" (lib/mail/imap.ts) — reads the same
 * real mailbox the SMTP side sends as. Falls back to SMTP_HOST with "smtp."
 * swapped for "imap." and to SMTP_USER/PASS when the IMAP_* vars are unset,
 * since one set of mailbox credentials usually covers both (true for TransIP
 * Mail). Returns null when there's nothing to connect with.
 */
export function imapConfig(): ImapConfig | null {
  const host = env.IMAP_HOST?.trim() || env.SMTP_HOST?.trim().replace(/^smtp\./i, "imap.") || "";
  const user = env.IMAP_USER?.trim() || env.SMTP_USER?.trim() || "";
  const pass = env.IMAP_PASS || env.SMTP_PASS || "";
  if (!host || !user || !pass) return null;
  return { host, port: env.IMAP_PORT, secure: env.IMAP_SECURE, user, pass, verifyTls: verifyTlsFor(host) };
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
  // Bijlagen: het gewone bericht (hieronder gebouwd) wordt het eerste deel van
  // een multipart/mixed, elke bijlage een deel erna.
  const bijlagen = input.attachments ?? [];
  if (bijlagen.length > 0) {
    const mixed = `zfm_${randomUUID().replace(/-/g, "")}`;
    const binnen = buildRaw({ ...input, attachments: [] }, from, messageId);
    const scheiding = binnen.indexOf("\r\n\r\n");
    const kop = binnen.slice(0, scheiding).split("\r\n");
    const lichaam = binnen.slice(scheiding + 4);
    // de Content-Type van het gewone bericht verhuist naar het eerste deel
    const contentType = kop.find((h) => /^Content-Type:/i.test(h)) ?? "Content-Type: text/plain; charset=UTF-8";
    const encoding = kop.find((h) => /^Content-Transfer-Encoding:/i.test(h));
    const algemeen = kop.filter((h) => !/^Content-Type:|^Content-Transfer-Encoding:/i.test(h));
    return [
      ...algemeen,
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      contentType,
      ...(encoding ? [encoding] : []),
      "",
      lichaam.replace(/\r\n$/, ""),
      ...bijlagen.flatMap((b) => {
        const naam = b.filename.replace(/["\r\n]/g, "");
        const data = typeof b.content === "string" ? Buffer.from(b.content, "utf8") : b.content;
        return [
          `--${mixed}`,
          `Content-Type: ${b.contentType}; name="${naam}"`,
          `Content-Transfer-Encoding: base64`,
          `Content-Disposition: attachment; filename="${naam}"`,
          "",
          (data.toString("base64").match(/.{1,76}/g) ?? []).join("\r\n"),
        ];
      }),
      `--${mixed}--`,
      "",
    ].join("\r\n");
  }
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

/** 4xx SMTP replies and network hiccups are worth a retry; 5xx are not. */
export function isTransientSmtpError(message: string): boolean {
  return /->\s*4\d\d\b|\b4\.\d\.\d\b|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket|closed/i.test(message);
}

// TransIP answers bursts of logins with temporary 4xx replies ("451 4.3.2
// Internal server error") or drops the connection — retry those twice with a
// short back-off; permanent 5xx errors fail straight away.
async function deliverWithRetry(
  cfg: SmtpConfig,
  from: string,
  to: string,
  raw: string,
): Promise<{ delivered: boolean; error: string | undefined }> {
  let error: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt === 1 ? 2000 : 6000));
    try {
      await sendViaSmtp(cfg, { from, to: [to], raw });
      return { delivered: true, error: undefined };
    } catch (err) {
      error = (err as Error).message;
      if (!isTransientSmtpError(error)) break;
    }
  }
  return { delivered: false, error };
}

/**
 * Re-send a mail from the admin mailbox that failed over SMTP, exactly as it
 * was stored (its text already carries any footer). Updates the record.
 */
export async function resendStoredMail(id: string): Promise<{ delivered: boolean; error?: string }> {
  const rec = await readSentMessage(id);
  if (!rec) return { delivered: false, error: "Bericht niet gevonden." };
  if (rec.delivered) return { delivered: true };
  if (rec.suppressed) return { delivered: false, error: `Ontvanger is ${rec.suppressed}.` };
  const cfg = smtpConfig();
  if (!cfg) return { delivered: false, error: "Geen mailserver ingesteld." };
  const to = rec.to[0]!;
  const { header } = fromHeader(rec.from);
  const raw = buildRaw(
    { to, subject: rec.subject, text: rec.text, ...(rec.html ? { html: rec.html } : {}), kind: rec.kind },
    header,
    `${rec.id}-r${Date.now().toString(36)}@${hostFromUrl(env.APP_BASE_URL)}`,
  );
  const { delivered, error } = await deliverWithRetry(cfg, rec.from, to, raw);
  const { error: _old, ...rest } = rec;
  await saveSentMessage({ ...rest, delivered, transport: "smtp", ...(error ? { error } : {}) });
  return { delivered, ...(error ? { error } : {}) };
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const id = randomUUID().slice(0, 12);

  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const category = mailCategoryForKind(input.kind);
  const automated = isAutomatedKind(input.kind);
  const footerLines: string[] = [];
  let suppressed: string | undefined;

  // Een adres dat hard terugkaatste (lib/mail/bounce-ronde.ts) krijgt geen outreach, nieuwsbrief of herinnering meer.
  // Verificatie, wachtwoord, beveiliging en andere noodzakelijke mail gaan altijd door; een storing hier laat de mail door.
  if (blokBijBounce(input.kind) && (await heeftHardeBounce(input.to))) {
    suppressed = "teruggekaatst (het adres bestaat niet)";
  }

  // Optional-category mail: honour the recipient's unsubscribe.
  if (!suppressed && isOptionalCategory(category)) {
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
  // .test/.example/.invalid/.localhost can never be delivered (RFC 2606/6761): keep it in the local
  // mailbox instead of bouncing at the mail server — and a test can never reach a real inbox
  if (cfg && !suppressed && !isReservedTestAddress(input.to)) {
    transport = "smtp";
    ({ delivered, error } = await deliverWithRetry(cfg, addr, input.to, raw));
    if (!delivered) logger.warn("smtp delivery failed - mail kept in local mailbox", { domein: ontvangerDomeinen(input.to), error: zonderAdressen(error) });
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

  // alleen het domein van de ontvanger in het log (12 nov, 86): het adres zelf hoort niet in de docker-logs
  logger.info("mail sent", { to: ontvangerVoorLog(input.to), kind: rec.kind, delivered, transport, ...(suppressed ? { suppressed } : {}) });
  return { id, delivered, transport, ...(error ? { error } : {}), ...(suppressed ? { suppressed } : {}) };
}

// ---- templates ----------------------------------------------------------


export function mailShell(title: string, bodyHtml: string): string {
  return shell(title, bodyHtml);
}
export function mailButton(href: string, label: string): string {
  return button(href, label);
}

export function verificationEmail(fullName: string, link: string, code?: string, taal: MailTaal = "nl"): MailInput {
  return verificationEmailT(fullName, link, code, taal);
}

export function welcomeEmail(
  fullName: string,
  type: "freelancer" | "bedrijf",
  appUrl: string,
  workerKind?: "zzp" | "flexwerker" | "uitzendkracht",
  opties: { ontwikkelingsnotitie?: boolean } = {},
  taal: MailTaal = "nl",
): MailInput {
  return welcomeEmailT(fullName, type, appUrl, workerKind, opties, taal);
}

/** Reminder for an account that was created but not finished (data / verification). */
export function onboardingReminderEmail(
  fullName: string,
  kind: "freelancer" | "uitzendkracht" | "bedrijf",
  appUrl: string,
  step: number,
  /** de precieze toestand (lib/onboarding/voortgang.ts herinneringInhoud): wat nog open staat, met een pad vanaf de root */
  inhoud?: { todo: string; why: string; href: string },
  /** een werker: precies wat er mist, in zijn app-taal (lib/onboarding/herinnering-teksten.ts); dan gelden `inhoud` en de Nederlandse tekst hieronder niet */
  werker?: WerkerHerinnering,
): MailInput {
  const first = fullName.split(" ")[0] || fullName;
  const base = appUrl.replace(/\/+$/, "");
  if (werker && werker.items.length) {
    const links = werker.items.map((i) => ({ tekst: i.tekst, href: `${base}${i.href}` }));
    const eerste = werker.knopHref ? `${base}${werker.knopHref}` : links[0]!.href;
    return {
      to: "",
      subject: werker.onderwerp,
      kind: "onboarding-reminder",
      text: `${werker.aanhef}\n\n${werker.intro}${werker.stapRegel ? `\n${werker.stapRegel}` : ""}\n${links.map((l) => `- ${l.tekst}: ${l.href}`).join("\n")}\n\n${werker.duurt}\n\n${werker.hulp}`,
      html: shell(
        werker.onderwerp,
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(werker.aanhef)}</p>
       <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(werker.intro)}</p>
       ${werker.stapRegel ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;font-weight:600;color:#1B2A22">${escapeHtml(werker.stapRegel)}</p>` : ""}
       <ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;color:#3C4A42">${links.map((l) => `<li><a href="${escapeHtml(l.href)}" style="color:#1F6B4A">${escapeHtml(l.tekst)}</a></li>`).join("")}</ul>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${escapeHtml(werker.duurt)}</p>
       <p style="margin:0">${button(eerste, werker.knop)}</p>
       <p style="margin:20px 0 0;font-size:12px;color:#667469">${escapeHtml(werker.hulp)}</p>`,
        werker.preheader,
        werker.taal ?? "nl",
      ),
    };
  }
  const { href, todo, why } = inhoud
    ? { ...inhoud, href: `${base}${inhoud.href}` }
    : kind === "bedrijf"
      ? {
          href: `${base}/werkgever`,
          todo: "vul je KVK-nummer en eerste vestiging in",
          why: "Zodra je bedrijf geverifieerd is, kun je klussen plaatsen en freelancers inplannen. Tot die tijd kun je één testklus uitzetten.",
        }
      : kind === "uitzendkracht"
        ? {
            href: `${base}/dashboard/verificatie`,
            todo: "vul je BSN, thuisbasis en rekeningnummer in, bevestig je identiteit en onderteken je uitzendovereenkomst",
            why: "Daarna kun je direct op klussen reageren en word je uitbetaald via ZekerFlex.",
          }
        : {
            href: `${base}/dashboard/verificatie`,
            todo: "koppel je KVK- of btw-nummer en bevestig je identiteit",
            why: "Daarna kun je direct klussen aannemen bij bedrijven in heel Nederland en word je snel uitbetaald.",
          };
  const subject = step >= 3 ? "Laatste herinnering: maak je ZekerFlex-account af" : "Je ZekerFlex-account is bijna klaar";
  return {
    to: "",
    subject,
    kind: "onboarding-reminder",
    text: `Hoi ${first},\n\nJe ZekerFlex-account is nog niet af: ${todo}. ${why}\n\nHet duurt een paar minuten: ${href}\n\nVragen? Antwoord gewoon op deze mail.`,
    html: shell(
      subject,
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${escapeHtml(first)}, je account is nog niet af: <strong>${todo}</strong>.</p>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3C4A42">${why} Het kost een paar minuten.</p>
       <p style="margin:0">${button(href, "Account afmaken")}</p>
       <p style="margin:20px 0 0;font-size:12px;color:#667469">Vragen? Antwoord gewoon op deze mail.</p>`,
      `Nog een paar minuten werk: ${todo}.`,
    ),
  };
}

/**
 * Het ID van een werker is geverifieerd (lib/onboarding/id-geverifieerd.ts). "Je kunt vanaf nu
 * reageren" alleen als dat echt zo is (lib/onboarding/kan-reageren.ts); anders zeggen we alleen wat
 * voor het ID geldt. Valt onder "Tips" (kind "onboarding"): afmelden kan onderaan.
 */
export function idGeverifieerdEmail(fullName: string, appUrl: string, kanReageren = false, taal: MailTaal = "nl"): MailInput {
  return idGeverifieerdEmailT(fullName, appUrl, kanReageren, taal);
}

export type { AanmeldingCompleetSoort };

/**
 * De werker heeft alle stappen van de start ingevuld (lib/onboarding/aanmelding-compleet.ts). Eén
 * mail, die zegt hoe het ervoor staat: meteen reageren, nog één ding (de reden uit
 * lib/fiscal/eligibility.ts, bijv. het IBAN), of we controleren nog het ID (dan volgt de mail
 * "Je ID is geverifieerd"). Over de eigen account: altijd bezorgd (geen optionele categorie).
 */
export function aanmeldingCompleetEmail(input: { fullName: string; appUrl: string; soort: AanmeldingCompleetSoort; reden?: string | null }, taal: MailTaal = "nl"): MailInput {
  return aanmeldingCompleetEmailT(input, taal);
}

/**
 * Een klus die bij een werker past, voor wie het voorstel niet via een pushmelding
 * aankwam (lib/notifications/klus-mail.ts). Valt onder "Nieuwe klussen die bij je
 * passen" (klus-alerts): afmelden kan onderaan. Titel, vestiging en plaats komen
 * van de opdrachtgever en gaan dus door escapeHtml.
 */
export function klusVoorstelEmail(
  input: { fullName: string; title: string; branch: string; city: string; when: string; rate: string; travelMinutes: number | null; link: string },
  taal: MailTaal = "nl",
): MailInput {
  return klusVoorstelEmailT(input, taal);
}

export function passwordResetEmail(fullName: string, link: string, taal: MailTaal = "nl"): MailInput {
  return passwordResetEmailT(fullName, link, taal);
}

export function accountDeletionEmail(fullName: string, link: string, taal: MailTaal = "nl"): MailInput {
  return accountDeletionEmailT(fullName, link, taal);
}

export function invoiceIssuedEmail(
  orgName: string,
  link: string,
  invoiceNumber: string,
  totalCents: number,
  description: string,
): MailInput {
  const total = (totalCents / 100).toFixed(2).replace(".", ",");
  return {
    to: "",
    subject: `Nieuwe factuur ${invoiceNumber} — € ${total}`,
    kind: "invoice",
    text: `Hoi,\n\nEr staat een nieuwe factuur voor ${orgName} op ZekerFlex: ${invoiceNumber}, € ${total} (${description}).\n\nBekijk en betaal de factuur:\n${link}`,
    html: shell(
      "Nieuwe factuur",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Er staat een nieuwe factuur voor <strong>${orgName}</strong> op ZekerFlex: <strong>${invoiceNumber}</strong>, <strong>€ ${total}</strong> (${description}).</p>
       <p style="margin:0 0 20px">${button(link, "Bekijk factuur")}</p>
       <p style="margin:0;font-size:12px;color:#667469">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${link}</span></p>`,
    ),
  };
}

export function teamInvitedEmail(tenantName: string, inviterName: string, link: string): MailInput {
  return {
    to: "",
    subject: `${inviterName} nodigt je uit voor het ZekerFlex-team van ${tenantName}`,
    kind: "team-uitnodiging",
    text: `Hoi,\n\n${inviterName} nodigt je uit om mee te werken in het ZekerFlex-account van ${tenantName}.\n\nAccepteer de uitnodiging:\n${link}\n\nDeze link is 14 dagen geldig.`,
    html: shell(
      "Teamuitnodiging",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42"><strong>${inviterName}</strong> nodigt je uit om mee te werken in het ZekerFlex-account van <strong>${tenantName}</strong>.</p>
       <p style="margin:0 0 20px">${button(link, "Uitnodiging accepteren")}</p>
       <p style="margin:0;font-size:12px;color:#667469">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${link}</span></p>
       <p style="margin:16px 0 0;font-size:12px;color:#667469">Deze link is 14 dagen geldig.</p>`,
    ),
  };
}

export function hoursCorrectionProposedEmail(
  fullName: string,
  link: string,
  shiftTitle: string,
  claimedHours: number,
  proposedHours: number,
  taal: MailTaal = "nl",
): MailInput {
  return hoursCorrectionProposedEmailT(fullName, link, shiftTitle, claimedHours, proposedHours, taal);
}

/** "…@domein.nl" per ontvanger: genoeg om een bezorgprobleem per domein te zien, zonder het adres zelf. */
export function ontvangerVoorLog(to: unknown): string {
  const lijst = Array.isArray(to) ? to : [to];
  return lijst
    .map((a) => {
      const s = String(a ?? "");
      const at = s.lastIndexOf("@");
      return at >= 0 ? `…@${s.slice(at + 1).replace(/[>\s,;].*$/, "").toLowerCase()}` : "…";
    })
    .join(", ");
}
