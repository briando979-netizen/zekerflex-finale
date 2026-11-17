// Gratis maildiensten: een adres daar zegt niets over het bedrijf, dus het domein telt nooit als "hetzelfde bedrijf".
// Puur; gedeeld door de onderdrukkingslijst (lib/sales/suppression.ts) en "Introduceer een bedrijf" (lib/introducties/lead.ts).

export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.nl", "outlook.com",
  "outlook.nl", "live.nl", "live.com", "icloud.com", "me.com", "yahoo.com",
  "yahoo.nl", "ziggo.nl", "kpnmail.nl", "planet.nl", "home.nl", "xs4all.nl",
  "telfort.nl", "casema.nl", "chello.nl", "hetnet.nl", "upcmail.nl", "quicknet.nl",
  "zonnet.nl", "proton.me", "protonmail.com", "gmx.com", "gmx.net",
]);

/** Het domein van een zakelijk adres ("jan@bakkerij.nl" → "bakkerij.nl"); null bij een gratis maildienst of geen domein. */
export function zakelijkDomein(email: string): string | null {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at === -1) return null;
  const d = e.slice(at + 1);
  return d.includes(".") && !FREE_MAIL_DOMAINS.has(d) ? d : null;
}
