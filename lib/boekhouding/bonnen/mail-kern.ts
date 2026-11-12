// ---------------------------------------------------------------------------
// Bonnen per mail: de pure kern. Een mail is een bonnetje als hij oorspronkelijk aan bonnetjes@zekerflex.com gericht
// was (To, Cc, Delivered-To of X-Original-To: het alias stuurt door naar info@, dus alleen kijken naar de ontvanger
// van de mailbox zou niets vinden). Automatisch boeken mag alleen als de afzender op de lijst eigen afzenders staat en
// SPF en DKIM zijn geslaagd volgens de Authentication-Results die onze eigen mailserver er bovenaan zette.
// Niets hier gebruikt prisma of kv, en niets logt een adres of inhoud.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { sha256Hex } from "./bestand";

export const BONNETJES_ADRES = "bonnetjes@zekerflex.com";

/** Kopregels als lijst per (kleine-letter) naam; een naam kan meerdere keren voorkomen. Opvolgregels zijn aaneengeplakt. */
export type Kopregels = Map<string, string[]>;

export function parseKop(kop: string): Kopregels {
  const uit: Kopregels = new Map();
  const ontvouwen = kop.replace(/\r?\n[ \t]+/g, " ");
  for (const regel of ontvouwen.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9-]+):[ \t]*(.*)$/.exec(regel);
    if (!m) continue;
    const naam = m[1]!.toLowerCase();
    const lijst = uit.get(naam) ?? [];
    lijst.push(m[2]!.trim());
    uit.set(naam, lijst);
  }
  return uit;
}

const eerste = (k: Kopregels, naam: string): string | null => k.get(naam)?.[0] ?? null;

/** Alle e-mailadressen in een kopwaarde (`Naam <a@b.nl>, c@d.nl`), kleine letters. */
export function adressenUit(waarde: string): string[] {
  const uit: string[] = [];
  for (const m of waarde.matchAll(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) uit.push(m[0].toLowerCase());
  return uit;
}

/** Was deze mail oorspronkelijk (ook) aan het bonnetjes-adres gericht? */
export function isBonnetjesMail(kop: Kopregels, alias: string = BONNETJES_ADRES): boolean {
  const doel = alias.toLowerCase();
  for (const naam of ["to", "cc", "delivered-to", "x-original-to", "envelope-to", "x-envelope-to"]) {
    for (const waarde of kop.get(naam) ?? []) {
      if (adressenUit(waarde).includes(doel)) return true;
    }
  }
  return false;
}

/** Het adres van de afzender (From), kleine letters, of null. */
export function afzenderAdres(kop: Kopregels): string | null {
  const from = eerste(kop, "from");
  return from ? (adressenUit(from)[0] ?? null) : null;
}

/** Het Message-ID zonder punthaken, of null. */
export function messageIdUit(kop: Kopregels): string | null {
  const m = eerste(kop, "message-id");
  const schoon = m?.replace(/^<|>$/g, "").trim() ?? "";
  return schoon ? schoon.slice(0, 300) : null;
}

/**
 * De sleutel waarmee een mail nooit twee keer wordt verwerkt: de hash van het Message-ID. Mist dat (zeldzaam), dan de
 * hash van de datum, de afzender en het onderwerp. Nooit het ID zelf of een adres in de opslagsleutel.
 */
export function mailSleutel(kop: Kopregels): string {
  const id = messageIdUit(kop);
  return sha256Hex(id !== null ? `id:${id}` : `kop:${eerste(kop, "date") ?? ""}|${afzenderAdres(kop) ?? ""}|${eerste(kop, "subject") ?? ""}`);
}

// ---- Authentication-Results ------------------------------------------------

export type AuthUitslag = "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror" | "policy" | string;

export interface Authenticatie {
  spf: AuthUitslag | null;
  /** de uitslag van de eerste DKIM-handtekening die slaagde, anders van de eerste die er was */
  dkim: AuthUitslag | null;
  /** het domein (header.d) van een geslaagde DKIM-handtekening, of null */
  dkimDomein: string | null;
}

/**
 * De authserv-id's van onze eigen mailserver (TransIP) die we vertrouwen. Gemeten 12 nov 2026 op de echte postbus:
 * "scott201" en "scott202" (twee mailservers van TransIP). Een authserv-id uit BONNEN_AUTHSERV_ID (komma of spatie
 * gescheiden) komt erbij; een afzender kan zelf nooit een id op deze lijst zetten dat boven die van TransIP uitkomt.
 */
export const VASTE_AUTHSERV_IDS: readonly string[] = ["scott201", "scott202"];

export function authservLijst(extra?: string | null): string[] {
  const uit = new Set<string>(VASTE_AUTHSERV_IDS);
  for (const t of (extra ?? "").split(/[\s,;]+/)) if (t.trim()) uit.add(t.trim().toLowerCase());
  return [...uit];
}

const authservId = (regel: string): string => (regel.split(";")[0] ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";

function leesUitslagen(delen: readonly string[]): Authenticatie {
  const uit: Authenticatie = { spf: null, dkim: null, dkimDomein: null };
  for (const deel of delen) {
    const m = /^\s*(spf|dkim)\s*=\s*([a-z]+)/i.exec(deel);
    if (!m) continue;
    const methode = m[1]!.toLowerCase();
    const uitslag = m[2]!.toLowerCase();
    if (methode === "spf") {
      if (uit.spf === null || uitslag === "pass") uit.spf = uitslag;
    } else if (uitslag === "pass" && uit.dkim !== "pass") {
      uit.dkim = "pass";
      uit.dkimDomein = /header\.(?:d|i)\s*=\s*"?(?:[^@\s;"]*@)?([A-Za-z0-9.-]+)/i.exec(deel)?.[1]?.toLowerCase() ?? null;
    } else if (uit.dkim === null) {
      uit.dkim = uitslag;
    }
  }
  return uit;
}

/**
 * De uitslagen uit de ARC-Authentication-Results ("i=1; scott201; spf=pass ...") met de HOOGSTE i, alleen als die regel
 * van een vertrouwde server komt. TransIP zet SPF en DKIM hier neer (niet in Authentication-Results). Een nagemaakte
 * regel van de afzender zit er altijd onder (lagere i: onze server zet er daarna zijn eigen bij). Staan er twee regels
 * met dezelfde hoogste i en is er één niet vertrouwd, dan telt niets.
 */
function arcUitslagen(kop: Kopregels, toegestaan: ReadonlySet<string>): readonly string[] | null {
  const regels = (kop.get("arc-authentication-results") ?? []).flatMap((r) => {
    const delen = r.split(";");
    const i = /^\s*i\s*=\s*(\d+)\s*$/i.exec(delen[0] ?? "");
    if (!i) return [];
    const id = (delen[1] ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    return [{ i: Number(i[1]), id, methoden: delen.slice(2) }];
  });
  if (regels.length === 0) return null;
  const hoogste = Math.max(...regels.map((r) => r.i));
  const top = regels.filter((r) => r.i === hoogste);
  if (top.some((r) => !toegestaan.has(r.id))) return null;
  return top[0]?.methoden ?? null;
}

/**
 * Leest de Authentication-Results (RFC 8601). Zonder `vertrouwd` telt alleen de BOVENSTE regel. Met een lijst
 * authserv-id's (de eerste term van de regel) telt alleen een regel van een van die servers: zo kan een nagemaakte regel
 * van de afzender nooit slagen. Staat er geen gewone regel van een vertrouwde server, dan de ARC-Authentication-Results
 * met de hoogste i (zie arcUitslagen). Geen regel = alles null = niet geslaagd.
 */
export function parseAuthenticationResults(kop: Kopregels, vertrouwd?: string | readonly string[]): Authenticatie {
  const lijst = (typeof vertrouwd === "string" ? [vertrouwd] : (vertrouwd ?? [])).map((v) => v.trim().toLowerCase()).filter(Boolean);
  const regels = kop.get("authentication-results") ?? [];
  const toegestaan = new Set(lijst);
  const regel = lijst.length ? regels.find((r) => toegestaan.has(authservId(r))) : regels[0];
  if (regel) return leesUitslagen(regel.split(";").slice(1));
  if (lijst.length === 0) return leesUitslagen([]);
  return leesUitslagen(arcUitslagen(kop, toegestaan) ?? []);
}

/** Hoort dit domein bij (of onder) het domein van de afzender? "mail.hetzner.com" past bij "hetzner.com". */
function domeinSluitAan(dkimDomein: string, afzenderDomein: string): boolean {
  return afzenderDomein === dkimDomein || afzenderDomein.endsWith(`.${dkimDomein}`) || dkimDomein.endsWith(`.${afzenderDomein}`);
}

/**
 * SPF en DKIM geslaagd, en de DKIM-handtekening hoort bij het domein van de afzender (anders kan iedereen met een eigen
 * domein een geslaagde handtekening halen en toch een vertrouwd adres in From zetten).
 */
export function spfDkimGeslaagd(auth: Authenticatie, afzender: string | null): boolean {
  if (auth.spf !== "pass" || auth.dkim !== "pass" || auth.dkimDomein === null || afzender === null) return false;
  const domein = afzender.split("@")[1];
  return domein !== undefined && domeinSluitAan(auth.dkimDomein, domein);
}

// ---- lijst eigen afzenders -------------------------------------------------

export const MAX_EIGEN_AFZENDERS = 100;
const ADRES = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const DOMEIN = /^@[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * Een lijst eigen afzenders controleren en schoonmaken: een volledig adres (factuur@hetzner.com) of een heel domein
 * (@hetzner.com). Kleine letters, geen dubbelen. Gooit AppError.validation met een Nederlandse tekst.
 */
export function valideerEigenAfzenders(invoer: unknown): string[] {
  if (!Array.isArray(invoer)) throw AppError.validation("De lijst met eigen afzenders moet een lijst zijn.");
  if (invoer.length > MAX_EIGEN_AFZENDERS) {
    throw AppError.validation(`De lijst met eigen afzenders mag hooguit ${MAX_EIGEN_AFZENDERS} regels hebben.`);
  }
  const uit = new Set<string>();
  for (const x of invoer) {
    if (typeof x !== "string") throw AppError.validation("Elke eigen afzender is een e-mailadres of een domein met een apenstaartje ervoor.");
    const s = x.trim().toLowerCase();
    if (s.length > 120 || !(ADRES.test(s) || DOMEIN.test(s))) {
      throw AppError.validation('Een eigen afzender is een e-mailadres (factuur@bedrijf.nl) of een heel domein (@bedrijf.nl).');
    }
    uit.add(s);
  }
  return [...uit];
}

/** Staat dit adres op de lijst (als adres of via zijn domein)? Een domein telt exact, niet voor subdomeinen. */
export function isEigenAfzender(adres: string | null, lijst: readonly string[]): boolean {
  if (adres === null) return false;
  const a = adres.toLowerCase();
  const domein = a.split("@")[1];
  return lijst.some((x) => x === a || (domein !== undefined && x === `@${domein}`));
}
