// ---------------------------------------------------------------------------
// De gegevens van de uitzendkracht in de uitzendovereenkomst (sjabloon v3, 15 nov 2026): naam, geboortedatum en woonadres.
// De eigenaar: "de uitzendcontracten moeten toch gegevens van de persoon zoals adres en naam hebben". Tot nu toe bewaarden we
// bewust alleen de postcode (de thuisbasis voor de reistijd); het volledige woonadres is voor een uitzendkracht ook nodig in de
// loonadministratie. Het staat in de fiscale gegevens (KV "fiscal:<userId>", met bewaarplicht) en wordt alleen gevraagd bij de
// overeenkomst, niet bij de aanmelding. Puur: geen prisma, kv of zod (het scherm in de browser gebruikt dezelfde regels).
// ---------------------------------------------------------------------------

export interface Woonadres {
  straat: string;
  huisnummer: string;
  postcode: string;
  plaats: string;
  /** het land zoals de werker het schrijft; standaard "Nederland" */
  land: string;
}

export type WoonadresVeld = keyof Woonadres;

const NL_NAMEN = new Set(["nederland", "nl", "the netherlands", "netherlands", "holland", "niderlandy", "olanda", "țările de jos", "нідерланди"]);

/** Woont de werker in Nederland? Dan geldt de Nederlandse postcode (1234 AB) en noemt de overeenkomst het land niet. */
export function isNederland(land: string): boolean {
  return NL_NAMEN.has(land.trim().toLowerCase());
}

/** "1234ab" of "1234 AB" → "1234 AB"; iets anders → null. */
export function netteNlPostcode(v: string): string | null {
  const m = /^\s*([1-9]\d{3})\s?([a-zA-Z]{2})\s*$/.exec(v);
  return m ? `${m[1]} ${(m[2] ?? "").toUpperCase()}` : null;
}

const schoon = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Controleert een ingevuld woonadres. Geeft het nette adres terug, of het eerste veld dat niet klopt (in de volgorde van het
 * formulier). Een huisnummer begint met een cijfer en mag een toevoeging hebben ("12", "12a", "12-3", "12 bis").
 */
export function controleerWoonadres(invoer: unknown): { ok: true; adres: Woonadres } | { ok: false; veld: WoonadresVeld } {
  const o = (invoer && typeof invoer === "object" ? invoer : {}) as Record<string, unknown>;
  const land = schoon(o.land, 56) || "Nederland";
  const straat = schoon(o.straat, 100);
  const huisnummer = schoon(o.huisnummer, 16);
  const plaats = schoon(o.plaats, 80);
  const postcodeRuw = schoon(o.postcode, 12);
  if (straat.length < 2 || !/\p{L}/u.test(straat)) return { ok: false, veld: "straat" };
  if (!/^\d{1,5}(?:[\s-]?[\p{L}\d]{1,6}){0,2}$/u.test(huisnummer)) return { ok: false, veld: "huisnummer" };
  let postcode: string;
  if (isNederland(land)) {
    const nl = netteNlPostcode(postcodeRuw);
    if (!nl) return { ok: false, veld: "postcode" };
    postcode = nl;
  } else {
    if (!/^[\p{L}\d][\p{L}\d\s-]{1,10}$/u.test(postcodeRuw)) return { ok: false, veld: "postcode" };
    postcode = postcodeRuw.toUpperCase();
  }
  if (plaats.length < 2 || !/\p{L}/u.test(plaats)) return { ok: false, veld: "plaats" };
  if (land.length < 2 || !/\p{L}/u.test(land)) return { ok: false, veld: "land" };
  return { ok: true, adres: { straat, huisnummer, postcode, plaats, land } };
}

/** Het adres op één regel, zoals in de overeenkomst: "Dorpsstraat 12a, 1234 AB Utrecht" (buiten Nederland met het land erbij). */
export function woonadresRegel(a: Woonadres): string {
  const basis = `${a.straat} ${a.huisnummer}, ${a.postcode} ${a.plaats}`;
  return isNederland(a.land) ? basis : `${basis}, ${a.land}`;
}

/** Een bewaard adres (uit de KV) alleen als het nog steeds klopt; anders null. */
export function leesWoonadres(v: unknown): Woonadres | null {
  const r = controleerWoonadres(v);
  return r.ok ? r.adres : null;
}

/** Zijn de gegevens voor de overeenkomst compleet: een geldige geboortedatum en een geldig woonadres? */
export function gegevensVoorContractCompleet(f: { birthDate: string | null | undefined; woonadres?: unknown }): boolean {
  return Boolean(f.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(f.birthDate)) && leesWoonadres(f.woonadres) !== null;
}
