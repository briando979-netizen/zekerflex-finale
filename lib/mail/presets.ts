// ---------------------------------------------------------------------------
// Known mail providers for "connect your own mailbox". Only encrypted ports
// (IMAP 993; SMTP 465 or 587 with STARTTLS). Server names are a starting
// point: connecting always tests both servers first, and "Geavanceerd" lets
// the user correct them.
// ---------------------------------------------------------------------------

export interface ServerSettings {
  host: string;
  port: number;
  /** true = TLS from the first byte (993/465); false = STARTTLS on 587 */
  secure: boolean;
}

export interface MailPreset {
  id: string;
  label: string;
  imap: ServerSettings;
  smtp: ServerSettings;
  note?: string;
  /** e-mail domains that belong to this provider */
  domains: string[];
}

export const MAIL_PRESETS: MailPreset[] = [
  {
    id: "transip",
    label: "TransIP",
    imap: { host: "imap.transip.email", port: 993, secure: true },
    smtp: { host: "smtp.transip.email", port: 465, secure: true },
    domains: [],
  },
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    note: "Gebruik een app-wachtwoord (Google-account → Beveiliging → App-wachtwoorden). Je gewone wachtwoord werkt hier niet.",
    domains: ["gmail.com", "googlemail.com"],
  },
  {
    id: "icloud",
    label: "iCloud Mail",
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
    note: "Maak een app-specifiek wachtwoord aan via account.apple.com → Inloggen en beveiliging.",
    domains: ["icloud.com", "me.com", "mac.com"],
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    note: "Gebruik een app-wachtwoord uit je Yahoo-accountbeveiliging.",
    domains: ["yahoo.com", "yahoo.nl", "ymail.com"],
  },
  {
    id: "kpn",
    label: "KPN Mail",
    imap: { host: "imap.kpnmail.nl", port: 993, secure: true },
    smtp: { host: "smtp.kpnmail.nl", port: 465, secure: true },
    domains: ["kpnmail.nl", "planet.nl", "hetnet.nl", "home.nl", "kpnplanet.nl"],
  },
  {
    id: "ziggo",
    label: "Ziggo Mail",
    imap: { host: "imap.ziggo.nl", port: 993, secure: true },
    smtp: { host: "smtp.ziggo.nl", port: 587, secure: false },
    domains: ["ziggo.nl", "upcmail.nl", "casema.nl", "quicknet.nl", "chello.nl"],
  },
  {
    id: "strato",
    label: "Strato",
    imap: { host: "imap.strato.de", port: 993, secure: true },
    smtp: { host: "smtp.strato.de", port: 465, secure: true },
    domains: [],
  },
];

/** Microsoft switched IMAP/SMTP to OAuth-only, so an app password can't connect these. */
export const OAUTH_ONLY_DOMAINS = ["outlook.com", "hotmail.com", "hotmail.nl", "live.com", "live.nl", "msn.com"];

export const OAUTH_ONLY_NOTE =
  "Outlook.com, Hotmail en Microsoft 365 staan inloggen met een (app-)wachtwoord niet meer toe; daarvoor is een Microsoft-koppeling (OAuth) nodig die nog niet beschikbaar is.";

export function domainOf(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/** Best guess for an address: a known provider, or imap./smtp. on its own domain. */
export function suggestServers(email: string): { presetId: string; imap: ServerSettings; smtp: ServerSettings } {
  const domain = domainOf(email);
  const preset = MAIL_PRESETS.find((p) => p.domains.includes(domain));
  if (preset) return { presetId: preset.id, imap: preset.imap, smtp: preset.smtp };
  return {
    presetId: "other",
    imap: { host: domain ? `imap.${domain}` : "", port: 993, secure: true },
    smtp: { host: domain ? `smtp.${domain}` : "", port: 465, secure: true },
  };
}
