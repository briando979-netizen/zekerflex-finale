// ---------------------------------------------------------------------------
// ZekerFlex Mail — the rules for an own address (jan@zekerflex.com). Pure and
// client-safe: the signup screens check as you type, the server checks again.
// Role and brand names stay reserved so nobody can write "as ZekerFlex".
// ---------------------------------------------------------------------------

export const ZF_MAIL_DOMAIN = "zekerflex.com";

/** Mailbox size asked for at TransIP (megabytes). */
export const ZF_MAILBOX_QUOTA_MB = 2048;

export const ZF_LOCAL_MIN = 3;
export const ZF_LOCAL_MAX = 40;

const RESERVED = new Set([
  // roles and system names
  "abuse", "admin", "administrator", "administratie", "beheer", "beheerder", "billing", "bounce", "bounces",
  "contact", "daemon", "dmarc", "dpo", "factuur", "facturen", "finance", "financien", "helpdesk", "hostmaster",
  "hr", "info", "it", "juridisch", "klantenservice", "legal", "mail", "mailer-daemon", "marketing", "noreply",
  "no-reply", "nobody", "office", "postmaster", "privacy", "root", "sales", "security", "service", "support",
  "system", "systeem", "team", "verkoop", "webmaster", "www",
  // ZekerFlex itself and its products
  "zekerflex", "zeker-flex", "zekerflexbank", "bank", "betalingen", "uitbetaling", "uitbetalingen", "payments",
  "nieuwsbrief", "newsletter", "notificaties", "notifications", "verificatie", "verify", "wachtwoord", "reset",
  "account", "accounts", "aanmelden", "registratie", "shop", "webshop", "winkel", "bestelling", "bestellingen",
  "orders", "retour", "offerte", "offertes", "vacatures", "jobs", "werkenbij", "pers", "press", "directie",
  "management", "eigenaar", "owner", "ceo", "jarvis", "claude", "ai", "bot", "robot", "test", "demo",
  "api", "app", "smtp", "imap", "pop", "pop3", "ftp", "dns", "mx",
]);

const strip = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** What someone typed → the local part we would use (lowercase, no spaces or accents). */
export function normalizeLocalPart(raw: string): string {
  return strip(raw)
    .replace(/@.*$/, "")
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".");
}

/** Why this local part can't be used, or null when it can. */
export function localPartProblem(local: string): string | null {
  if (local.length < ZF_LOCAL_MIN) return `Gebruik minstens ${ZF_LOCAL_MIN} tekens.`;
  if (local.length > ZF_LOCAL_MAX) return `Gebruik hoogstens ${ZF_LOCAL_MAX} tekens.`;
  if (!/^[a-z0-9._-]+$/.test(local)) return "Gebruik alleen letters, cijfers, punten, streepjes en lage streepjes.";
  if (!/^[a-z0-9]/.test(local) || !/[a-z0-9]$/.test(local)) return "Begin en eindig met een letter of cijfer.";
  if (/[._-]{2}/.test(local)) return "Zet geen twee leestekens achter elkaar.";
  if (/^\d+$/.test(local)) return "Gebruik ook letters, niet alleen cijfers.";
  if (RESERVED.has(local) || RESERVED.has(local.replace(/[._-]/g, ""))) return "Dit adres is gereserveerd.";
  if (/zeker.?flex/.test(local)) return "Adressen met 'zekerflex' erin zijn gereserveerd.";
  return null;
}

const PARTICLES = new Set(["van", "de", "der", "den", "het", "ter", "ten", "te", "t", "in", "op", "la", "le", "da", "di", "del", "von", "zu"]);

/** Address ideas from a name, best first: "Jan de Vries" → jan, jan.devries, jdevries, … */
export function suggestLocalParts(fullName: string, limit = 5): string[] {
  const words = strip(fullName)
    .replace(/[^a-z\s'-]/g, " ")
    .split(/[\s'-]+/)
    .filter(Boolean);
  const first = words[0] ?? "";
  const rest = words.slice(1);
  const surname = rest.join("");
  const core = rest.filter((w) => !PARTICLES.has(w)).join("");
  const ideas = [
    first,
    surname && `${first}.${surname}`,
    surname && `${first.charAt(0)}${surname}`,
    surname && `${first}${surname}`,
    surname && `${surname}.${first}`,
    core && core !== surname && `${first}.${core}`,
    surname && `${first}.${surname.charAt(0)}`,
  ];
  const out: string[] = [];
  for (const idea of ideas) {
    const lp = idea ? normalizeLocalPart(idea) : "";
    if (lp && !localPartProblem(lp) && !out.includes(lp)) out.push(lp);
  }
  return out.slice(0, limit);
}

const COMMON_PASSWORDS = ["wachtwoord", "password", "welkom", "welcome", "qwerty", "123456", "zekerflex", "letmein", "abc123"];

/** 0 (weak) – 4 (strong), for the meter under the password field. */
export function passwordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (kinds >= 3) score++;
  if (kinds === 4 || pw.length >= 20) score++;
  return Math.min(4, score);
}

/** Why a password isn't good enough, or null. */
export function passwordProblem(pw: string, ctx: { localPart?: string; name?: string } = {}): string | null {
  if (pw.length < 10) return "Gebruik minstens 10 tekens.";
  if (pw.length > 128) return "Gebruik hoogstens 128 tekens.";
  if (/^(.)\1+$/.test(pw)) return "Gebruik niet steeds hetzelfde teken.";
  const lower = pw.toLowerCase();
  if (pw.length < 16 && !(/[a-zA-Z]/.test(pw) && /[^a-zA-Z]/.test(pw))) return "Gebruik letters én cijfers of tekens (of minstens 16 tekens).";
  if (COMMON_PASSWORDS.some((c) => lower.includes(c))) return "Dit wachtwoord is te makkelijk te raden.";
  if (ctx.localPart && ctx.localPart.length >= 3 && lower.includes(ctx.localPart.toLowerCase())) return "Zet je mailadres niet in je wachtwoord.";
  const firstName = ctx.name ? strip(ctx.name).split(/\s+/)[0] : "";
  if (firstName && firstName.length >= 3 && lower.includes(firstName)) return "Zet je naam niet in je wachtwoord.";
  return null;
}

/** Why a sender name can't be used ("ZekerFlex Support" would look like us). */
export function displayNameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Vul je naam in.";
  if (n.length > 60) return "Gebruik hoogstens 60 tekens.";
  if (/[<>@"\\\u0000-\u001f]/.test(n)) return "Gebruik geen @, < > of aanhalingstekens.";
  if (/zeker\s*flex|klantenservice|helpdesk|\bsupport\b|\bbeheer/i.test(n)) return "Deze naam lijkt op ZekerFlex zelf; kies je eigen naam of bedrijfsnaam.";
  return null;
}
