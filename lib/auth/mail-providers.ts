// Snelknop "Open je mail" op /verifieer-email, op basis van het domein van het
// e-mailadres. Puur bestand (ook voor client-componenten). Alleen bekende
// webmailers met een vaste inbox-adres; bij elk ander domein geen knop.

export interface MailProvider {
  naam: string;
  url: string;
}

const PROVIDERS: Record<string, MailProvider> = {
  "gmail.com": { naam: "Gmail", url: "https://mail.google.com/mail/" },
  "googlemail.com": { naam: "Gmail", url: "https://mail.google.com/mail/" },
  "outlook.com": { naam: "Outlook", url: "https://outlook.live.com/mail/" },
  "outlook.nl": { naam: "Outlook", url: "https://outlook.live.com/mail/" },
  "hotmail.com": { naam: "Outlook", url: "https://outlook.live.com/mail/" },
  "hotmail.nl": { naam: "Outlook", url: "https://outlook.live.com/mail/" },
  "live.nl": { naam: "Outlook", url: "https://outlook.live.com/mail/" },
  "live.com": { naam: "Outlook", url: "https://outlook.live.com/mail/" },
  "msn.com": { naam: "Outlook", url: "https://outlook.live.com/mail/" },
  "icloud.com": { naam: "iCloud Mail", url: "https://www.icloud.com/mail" },
  "me.com": { naam: "iCloud Mail", url: "https://www.icloud.com/mail" },
  "yahoo.com": { naam: "Yahoo Mail", url: "https://mail.yahoo.com/" },
  "yahoo.nl": { naam: "Yahoo Mail", url: "https://mail.yahoo.com/" },
  "proton.me": { naam: "Proton Mail", url: "https://mail.proton.me/" },
  "protonmail.com": { naam: "Proton Mail", url: "https://mail.proton.me/" },
};

export function mailProviderFor(email: string): MailProvider | null {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || !Object.hasOwn(PROVIDERS, domain)) return null;
  return PROVIDERS[domain] ?? null;
}
