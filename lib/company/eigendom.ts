// ---------------------------------------------------------------------------
// Hoort de aanmelder echt bij het bedrijf van dit KVK-nummer? Een geldig en
// actief KVK-nummer bewijst alleen dat het bedrijf bestaat: iedereen kan het
// nummer van een ander bedrijf invullen. Automatisch goedkeuren doen we daarom
// alleen als het e-mailadres van de aanmelder op een eigen domein zit dat bij
// de naam in het Handelsregister past (info@bakkerijjansen.nl bij "Bakkerij
// Jansen B.V."). Gratis mail (gmail, hotmail, …) of een domein dat er niet bij
// past → ZekerFlex controleert met de hand (Admin → Bedrijven). Puur, getest.
// ---------------------------------------------------------------------------

/** Gratis of algemene maildiensten: zeggen niets over het bedrijf. */
const GRATIS_MAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.nl", "hotmail.be", "outlook.com", "outlook.nl", "outlook.be",
  "live.nl", "live.com", "live.be", "msn.com", "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.nl", "ymail.com",
  "ziggo.nl", "kpnmail.nl", "kpnplanet.nl", "planet.nl", "home.nl", "xs4all.nl", "hetnet.nl", "chello.nl", "casema.nl",
  "telfort.nl", "tele2.nl", "online.nl", "quicknet.nl", "zonnet.nl", "freeler.nl", "gmx.com", "gmx.net", "gmx.de",
  "web.de", "proton.me", "protonmail.com", "pm.me", "tutanota.com", "aol.com", "mail.com", "zoho.com", "telenet.be",
  "skynet.be", "example.com", "zekerflex.com",
]);

/** Rechtsvormen en vulwoorden: tellen niet mee als deel van de naam. */
const GEEN_NAAM = new Set(["b", "v", "bv", "nv", "n", "vof", "cv", "holding", "de", "het", "een", "en", "van", "der", "den", "the", "and", "of", "co", "ltd", "gmbh"]);

/** Deze delen van een domein zijn geen naam ("co.uk", "com.au"). */
const TWEEDE_NIVEAU = new Set(["co", "com", "org", "net", "ac", "gov", "nl", "be"]);

const normaal = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function emailDomein(email: string): string {
  const d = email.trim().toLowerCase().split("@")[1] ?? "";
  return d.replace(/\.$/, "");
}

export const isGratisMail = (domein: string): boolean => GRATIS_MAIL.has(domein.toLowerCase());

/** Het naamdeel van een domein: "mail.bakkerij-jansen.nl" → "bakkerijjansen". */
export function domeinNaam(domein: string): string {
  const delen = domein.toLowerCase().split(".").filter(Boolean);
  if (delen.length < 2) return "";
  let i = delen.length - 2;
  if (i > 0 && TWEEDE_NIVEAU.has(delen[i] ?? "") && (delen[i] ?? "").length <= 3) i -= 1;
  return normaal(delen[i] ?? "").replace(/[^a-z0-9]/g, "");
}

/** De woorden van een bedrijfsnaam die iets zeggen: "Bakkerij Jansen B.V." → ["bakkerij", "jansen"]. */
export function naamWoorden(naam: string): string[] {
  return normaal(naam)
    .replace(/&/g, " en ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !GEEN_NAAM.has(w));
}

/**
 * Past het domein bij de naam? De eerste twee woorden van de naam (of het ene
 * woord) moeten in het naamdeel van het domein staan, of de beginletters van
 * minstens drie woorden ("abc.nl" bij "Aannemersbedrijf Bouw Combinatie").
 */
export function domeinPastBijNaam(domein: string, naam: string): boolean {
  const label = domeinNaam(domein);
  const woorden = naamWoorden(naam);
  if (label.length < 3 || woorden.length === 0) return false;
  const kern = woorden.slice(0, 2);
  if (kern.every((w) => w.length >= 3 && label.includes(w))) return true;
  if (woorden.length >= 3 && label === woorden.map((w) => w[0]).join("")) return true;
  return false;
}

export type EigendomBewijs = { ok: true; via: "domein"; domein: string } | { ok: false; reden: "gratis-mail" | "domein-past-niet" | "geen-domein" };

/** Het oordeel voor één aanmelder: automatisch goed, of met de hand controleren (met de reden). */
export function eigendomVanEmail(email: string, namen: (string | null | undefined)[]): EigendomBewijs {
  const domein = emailDomein(email);
  if (!domein || !domein.includes(".")) return { ok: false, reden: "geen-domein" };
  if (isGratisMail(domein)) return { ok: false, reden: "gratis-mail" };
  const passend = namen.filter((n): n is string => Boolean(n && n.trim())).some((n) => domeinPastBijNaam(domein, n));
  return passend ? { ok: true, via: "domein", domein } : { ok: false, reden: "domein-past-niet" };
}
