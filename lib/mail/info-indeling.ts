import { isBounceAfzender } from "@/lib/mail/bounce";

// ---------------------------------------------------------------------------
// De postbus info@ indelen (18 nov 2026). Puur bestand: geen IMAP, KV of mail, zodat de tests en het scherm het ook
// kunnen gebruiken. De ronde die de postbus naloopt staat in lib/mail/info-ronde.ts.
//
// Waarom: van de 90 mails in een week waren er 65 automatisch (meldingen, nieuwsbrieven, eigen afzenders) en maar
// een stuk of twintig van mensen. De eigenaar zag de mensen niet meer tussen de meldingen.
//
// Indeling, in deze volgorde:
//   terugkaatser — een mailserver meldt dat iets niet aankwam
//   automatisch  — noreply, een lijst, een automatisch antwoord of een eigen afzender
//   bedrijf      — een mens die personeel zoekt, een offerte vraagt of een klus wil plaatsen: nooit automatisch beantwoorden
//   werkzoekend  — een mens die werk zoekt: één eerste antwoord met de aanmeldlink
//   rest         — al het andere: blijft gewoon staan
// Behoudend: bij twijfel is het "rest". Een woord telt alleen als heel woord of als vaste zin ("netwerk" is geen werk).
// ---------------------------------------------------------------------------

export type InfoSoort = "terugkaatser" | "automatisch" | "bedrijf" | "werkzoekend" | "rest";

export const INFO_MAPPEN = { automatisch: "Automatisch", terugkaatsers: "Terugkaatsers", beantwoord: "Beantwoord" } as const;

/** Eén kopregel uit de ruwe kop (gevouwen regels aaneen); "" als hij ontbreekt. */
export function kopVeld(kop: string, naam: string): string {
  const plat = kop.replace(/\r?\n[ \t]+/g, " ");
  for (const regel of plat.split(/\r?\n/)) {
    const i = regel.indexOf(":");
    if (i > 0 && regel.slice(0, i).trim().toLowerCase() === naam.toLowerCase()) return regel.slice(i + 1).trim();
  }
  return "";
}

const EIGEN_DOMEIN = /@([a-z0-9-]+\.)*zekerflex\.(com|nl)$/i;
const ROBOT_NAAM = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|mail-daemon|postmaster|bounces?|notifications?|notify|meldingen|nieuwsbrief|newsletter|news|mailing|alerts?|automated|system|daemon)([+._-].*)?$/i;

/** Is dit een terugkaatser? Aan de afzender, het onderwerp of het soort bericht (multipart/report). */
export function isTerugkaatser(vanAdres: string | null, onderwerp: string | null, kop = ""): boolean {
  if (isBounceAfzender(vanAdres, onderwerp)) return true;
  return /multipart\/report/i.test(kopVeld(kop, "Content-Type")) && /delivery-status/i.test(kopVeld(kop, "Content-Type"));
}

/** Komt dit van een systeem en niet van een mens? Geeft de reden, of null als het een mens lijkt. */
export function automatischeReden(vanAdres: string | null, kop: string): string | null {
  const adres = (vanAdres ?? "").trim().toLowerCase();
  if (!adres || !adres.includes("@")) return "geen afzender";
  if (ROBOT_NAAM.test(adres.split("@")[0] ?? "")) return "noreply-afzender";
  if (EIGEN_DOMEIN.test(adres)) return "eigen afzender";
  if (kopVeld(kop, "List-Unsubscribe") || kopVeld(kop, "List-Id")) return "lijstmail";
  if (/\b(bulk|list|junk)\b/i.test(kopVeld(kop, "Precedence"))) return "lijstmail";
  const auto = kopVeld(kop, "Auto-Submitted").toLowerCase();
  if (auto && !/^no\b/.test(auto)) return "automatisch antwoord";
  if (kopVeld(kop, "X-Auto-Response-Suppress") || kopVeld(kop, "X-Autoreply") || kopVeld(kop, "X-Autorespond")) return "automatisch antwoord";
  return null;
}

/** Heeft de mail een bijlage? (alleen aan de kop te zien: multipart/mixed) Zo'n mail kan een factuur of bon zijn. */
export function heeftBijlageKop(kop: string): boolean {
  return /multipart\/mixed/i.test(kopVeld(kop, "Content-Type"));
}

// Een bedrijf dat mensen of een dienst zoekt. Gaat vóór "werkzoekend": "vacature plaatsen" is geen sollicitatie.
const BEDRIJF = [
  /\bpersoneel\b/i,
  /\buitzendkracht(en)?\b/i,
  /\b(flexwerkers?|flexkrachten|oproepkrachten|krachten|medewerkers?|mensen|mankracht)\s+(nodig|gezocht|inhuren|inlenen)\b/i,
  /\b(inhuren|inlenen|inhuur)\b/i,
  /\bofferte\b/i,
  /\b(vacature|klus|opdracht|dienst)(s|en)?\s+(te\s+)?(plaatsen|uitzetten|aanbieden)\b/i,
  /\b(wij|we)\s+zoeken\b/i,
  /\bvoor\s+(ons|mijn)\s+(bedrijf|restaurant|zaak|winkel|magazijn|team)\b/i,
];

// Iemand die zelf werk zoekt. Losse woorden als "werk" of "baan" tellen niet: alleen een vaste zin of een woord dat
// niets anders kan betekenen.
const WERK = [
  /\bsollicit\w*/i,
  /\bwerkzoekend\w*/i,
  /\bbijbaan\b/i,
  /\bvakantiewerk\b/i,
  /\bvacatures?\b/i,
  /\b(op\s+zoek\s+naar|zoek(en)?|zoekt)\b[^.?!\n]{0,40}\b(werk|baan|bijbaan|job)\b/i,
  /\b(werk|baan)\s+(zoeken|gezocht|nodig)\b/i,
  /\b(wil|zou)\s+(ik\s+)?(heel\s+)?(graag\s+)?(bij\s+jullie\s+)?(komen\s+)?werken\b/i,
  /\bkan\s+ik\s+(bij\s+jullie|via\s+jullie|bij\s+zekerflex|via\s+zekerflex)\s+(komen\s+)?werken\b/i,
  /\bwerken\s+(bij|via)\s+(jullie|zekerflex)\b/i,
  /\bmijn\s+cv\b/i,
  /\blooking\s+for\s+(a\s+)?(job|work)\b/i,
  /\bszukam\s+pracy\b/i,
  /\bcaut\s+(de\s+)?lucru\b/i,
];

/** Het begin van de tekst dat meetelt bij het indelen (geciteerde oude mails en handtekeningen tellen niet mee). */
export function beginVanTekst(tekst: string): string {
  const zonderCitaat = tekst
    .split(/\r?\n/)
    .filter((r) => !/^\s*>/.test(r))
    .join("\n");
  return zonderCitaat.slice(0, 600);
}

export interface InfoInvoer {
  vanAdres: string | null;
  /** Reply-To, alleen als hij afwijkt van de afzender */
  replyTo?: string | null;
  onderwerp: string | null;
  /** de ruwe kopregels */
  kop: string;
  /** de tekst van de mail; alleen nodig (en alleen opgehaald) voor een mens */
  tekst?: string | null;
}

export interface InfoIndeling {
  soort: InfoSoort;
  /** korte reden, zonder adres of inhoud */
  reden: string;
}

export function deelIn(m: InfoInvoer): InfoIndeling {
  if (isTerugkaatser(m.vanAdres, m.onderwerp, m.kop)) return { soort: "terugkaatser", reden: "mailserver meldt een mislukte bezorging" };
  const auto = automatischeReden(m.vanAdres, m.kop);
  if (auto) return { soort: "automatisch", reden: auto };
  const stof = `${m.onderwerp ?? ""}\n${beginVanTekst(m.tekst ?? "")}`;
  if (BEDRIJF.some((r) => r.test(stof))) return { soort: "bedrijf", reden: "gaat over personeel, een offerte of een klus plaatsen" };
  if (WERK.some((r) => r.test(stof))) {
    // Een afwijkend antwoordadres kan een lijst of een formulier zijn: dan geen automatisch antwoord.
    if (m.replyTo && m.replyTo.trim().toLowerCase() !== (m.vanAdres ?? "").trim().toLowerCase()) return { soort: "rest", reden: "zoekt werk, maar het antwoordadres wijkt af" };
    return { soort: "werkzoekend", reden: "zoekt werk" };
  }
  return { soort: "rest", reden: "geen vaste soort" };
}

/** Een adres zoals het in het logboek en op het scherm mag staan: "j***@gmail.com". */
export function maskeerAdres(adres: string | null | undefined): string {
  const a = (adres ?? "").trim().toLowerCase();
  const i = a.lastIndexOf("@");
  if (i < 1) return "onbekend";
  return `${a[0]}***${a.slice(i)}`;
}

export const kort = (s: string | null | undefined, n = 70): string => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// ---- het eerste antwoord aan iemand die werk zoekt -------------------------------------------------------------

export const AANMELD_ADRES = "https://zekerflex.com/register";

export function antwoordOnderwerp(onderwerp: string | null | undefined): string {
  const kaal = (onderwerp ?? "").replace(/[\r\n]+/g, " ").replace(/^(\s*(re|aw|antw|fw|fwd)\s*:\s*)+/i, "").trim();
  return `Re: ${kaal || "je bericht aan ZekerFlex"}`;
}

export function antwoordTekst(): string {
  return [
    "Hallo,",
    "",
    "Bedankt voor je bericht. Fijn dat je via ZekerFlex wilt werken.",
    "",
    "Zo doe je mee:",
    `1. Maak gratis een account op ${AANMELD_ADRES}`,
    "2. Maak je profiel af en laat je ID controleren.",
    "3. Je krijgt een bericht zodra er een klus bij jou in de buurt is.",
    "",
    "Eerlijk gezegd: ZekerFlex is nog in opbouw. Er zijn nog niet in elke plaats klussen, dus het kan even duren voordat je iets van ons hoort. Aanmelden kost niets.",
    "",
    "Heb je nog een vraag? Antwoord dan gewoon op deze mail, die lezen we zelf.",
    "",
    "Groet,",
    "Team ZekerFlex",
    "",
    `English: thank you for your message. You can sign up for free at ${AANMELD_ADRES}`,
    "",
    "Dit eerste antwoord is automatisch verstuurd.",
  ].join("\n");
}
