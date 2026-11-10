import type { Kortingscode, VerzendGebied, Verzendmethode } from "@/lib/sites/types";
import { leesBedrag } from "@/lib/sites/winkel";
import { CODE_PATROON, kortingTekst, normaliseerCode } from "@/lib/sites/winkel-korting";
import { GEBIED_TEKST, prijsTekst } from "@/lib/sites/winkel-verzending";

// ---------------------------------------------------------------------------
// De formulieren van Webshop → Kortingen en Verzending: wat iemand typt (tekst)
// naar een kortingscode of verzendmethode, met per veld een Nederlandse foutzin.
// Puur, zodat de studio en de tests dezelfde regels gebruiken; de server
// controleert daarna nog een keer (lib/sites/schema.ts).
// ---------------------------------------------------------------------------

/** 1250 → "12,50"; null → "". */
export const bedragTekst = (c: number | null | undefined): string => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** "2026-12-31" → "31 december 2026" (zonder klok of tijdzone: het is een kalenderdag). */
export function datumTekst(dag: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dag);
  if (!m) return dag;
  return `${Number(m[3])} ${MAANDEN[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

// ---- kortingscodes ------------------------------------------------------------

export interface KortingConcept {
  id: string;
  code: string;
  soort: Kortingscode["soort"];
  waarde: string;
  minimum: string;
  totEnMet: string;
  max: string;
  actief: boolean;
}

export type KortingVeld = "code" | "waarde" | "minimum" | "totEnMet" | "max";

export const kortingNaarConcept = (k: Kortingscode): KortingConcept => ({
  id: k.id,
  code: k.code,
  soort: k.soort,
  waarde: k.soort === "procent" ? String(k.waarde) : bedragTekst(k.waarde),
  minimum: bedragTekst(k.minimumCents),
  totEnMet: k.totEnMet ?? "",
  max: k.maxGebruik === null ? "" : String(k.maxGebruik),
  actief: k.actief,
});

export const nieuwKortingConcept = (id: string): KortingConcept => ({ id, code: "", soort: "procent", waarde: "10", minimum: "", totEnMet: "", max: "", actief: true });

/** Een code om uit te delen: acht tekens zonder letters die op elkaar lijken (0/O, 1/I/L). */
export function willekeurigeCode(rand: () => number = Math.random): string {
  const tekens = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => tekens[Math.floor(rand() * tekens.length) % tekens.length] ?? "A").join("");
}

/** Eén kortingscode uit het formulier; een fout per veld als iets niet klopt. */
export function leesKortingConcept(c: KortingConcept, anderen: string[]): { code: Kortingscode | null; fouten: Partial<Record<KortingVeld, string>> } {
  const fouten: Partial<Record<KortingVeld, string>> = {};
  const code = normaliseerCode(c.code);
  if (!CODE_PATROON.test(code)) fouten.code = "Een code heeft 3 tot 20 letters, cijfers of streepjes, zoals ZOMER10.";
  else if (anderen.includes(code)) fouten.code = "Deze code bestaat al.";
  let waarde = 0;
  if (c.soort === "procent") {
    waarde = Number(c.waarde.trim().replace(",", "."));
    if (!Number.isInteger(waarde) || waarde < 1 || waarde > 100) fouten.waarde = "Vul een percentage in van 1 tot 100, zonder komma.";
  } else {
    waarde = leesBedrag(c.waarde) ?? 0;
    if (waarde < 1) fouten.waarde = "Vul het bedrag van de korting in, bijvoorbeeld 5,00.";
  }
  const minimum = c.minimum.trim() ? leesBedrag(c.minimum) : null;
  if (c.minimum.trim() && minimum === null) fouten.minimum = "Vul een bedrag in, bijvoorbeeld 25,00, of laat het leeg.";
  if (c.totEnMet && !/^\d{4}-\d{2}-\d{2}$/.test(c.totEnMet)) fouten.totEnMet = "Kies een datum, of laat het leeg.";
  const max = c.max.trim() ? Number(c.max.trim()) : null;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 1_000_000)) fouten.max = "Vul een heel aantal in (1 of meer), of laat het leeg voor onbeperkt.";
  if (Object.keys(fouten).length) return { code: null, fouten };
  return {
    code: { id: c.id, code, soort: c.soort, waarde, minimumCents: minimum && minimum > 0 ? minimum : null, totEnMet: c.totEnMet || null, maxGebruik: max, actief: c.actief },
    fouten,
  };
}

/** Alle codes uit het formulier; `fouten` per code-id (leeg = alles goed). */
export function leesKortingConcepten(lijst: KortingConcept[]): { codes: Kortingscode[]; fouten: Record<string, Partial<Record<KortingVeld, string>>> } {
  const codes: Kortingscode[] = [];
  const fouten: Record<string, Partial<Record<KortingVeld, string>>> = {};
  const gezien: string[] = [];
  for (const c of lijst) {
    const r = leesKortingConcept(c, gezien);
    gezien.push(normaliseerCode(c.code));
    if (r.code) codes.push(r.code);
    else fouten[c.id] = r.fouten;
  }
  return { codes, fouten };
}

/** Wat de code doet, ook als het formulier nog half is ingevuld: "10% korting vanaf € 25,00 · t/m 31 december 2026". */
export function kortingSamenvatting(c: KortingConcept): string {
  const r = leesKortingConcept({ ...c, code: c.code || "XXX" }, []);
  if (!r.code) return "Nog niet compleet";
  const delen = [kortingTekst(r.code)];
  if (r.code.totEnMet) delen.push(`t/m ${datumTekst(r.code.totEnMet)}`);
  if (r.code.maxGebruik !== null) delen.push(`hoogstens ${r.code.maxGebruik} keer`);
  return delen.join(" · ");
}

// ---- verzendmethoden ----------------------------------------------------------

export interface VerzendConcept {
  id: string;
  soort: Verzendmethode["soort"];
  naam: string;
  prijs: string;
  gratisVanaf: string;
  gebied: VerzendGebied;
  adres: string;
  levertijd: string;
  actief: boolean;
}

export type VerzendVeld = "naam" | "prijs" | "gratisVanaf";

export const verzendNaarConcept = (m: Verzendmethode): VerzendConcept => ({
  id: m.id,
  soort: m.soort,
  naam: m.naam,
  prijs: m.prijsCents ? bedragTekst(m.prijsCents) : "",
  gratisVanaf: bedragTekst(m.gratisVanafCents),
  gebied: m.gebied,
  adres: m.adres,
  levertijd: m.levertijd,
  actief: m.actief,
});

export const nieuwVerzendConcept = (id: string, soort: Verzendmethode["soort"]): VerzendConcept => ({
  id,
  soort,
  naam: soort === "afhalen" ? "Afhalen" : "",
  prijs: "",
  gratisVanaf: "",
  gebied: "nl",
  adres: "",
  levertijd: "",
  actief: true,
});

export function leesVerzendConcept(c: VerzendConcept): { methode: Verzendmethode | null; fouten: Partial<Record<VerzendVeld, string>> } {
  const fouten: Partial<Record<VerzendVeld, string>> = {};
  const naam = c.naam.trim();
  if (!naam) fouten.naam = c.soort === "afhalen" ? "Geef het afhaalpunt een naam, bijvoorbeeld Afhalen in de winkel." : "Geef de bezorgmethode een naam, bijvoorbeeld PostNL.";
  else if (naam.length > 60) fouten.naam = "Een naam is hoogstens 60 tekens.";
  const prijs = c.prijs.trim() ? leesBedrag(c.prijs) : 0;
  if (prijs === null) fouten.prijs = "Vul een bedrag in, bijvoorbeeld 4,95, of laat het leeg voor gratis.";
  const gratis = c.gratisVanaf.trim() ? leesBedrag(c.gratisVanaf) : null;
  if (c.gratisVanaf.trim() && gratis === null) fouten.gratisVanaf = "Vul een bedrag in, bijvoorbeeld 50,00, of laat het leeg.";
  if (Object.keys(fouten).length || prijs === null) return { methode: null, fouten };
  return {
    methode: {
      id: c.id,
      soort: c.soort,
      naam,
      prijsCents: prijs,
      // gratis vanaf heeft alleen zin als er een prijs is
      gratisVanafCents: prijs > 0 ? gratis : null,
      gebied: c.soort === "bezorgen" ? c.gebied : "nl",
      adres: c.soort === "afhalen" ? c.adres.trim().slice(0, 200) : "",
      levertijd: c.levertijd.trim().slice(0, 60),
      actief: c.actief,
    },
    fouten,
  };
}

/** Alle methoden uit het formulier, afhalen eerst (zo staan ze ook bij het afrekenen); `fouten` per id. */
export function leesVerzendConcepten(lijst: VerzendConcept[]): { methoden: Verzendmethode[]; fouten: Record<string, Partial<Record<VerzendVeld, string>>> } {
  const methoden: Verzendmethode[] = [];
  const fouten: Record<string, Partial<Record<VerzendVeld, string>>> = {};
  for (const c of [...lijst.filter((x) => x.soort === "afhalen"), ...lijst.filter((x) => x.soort === "bezorgen")]) {
    const r = leesVerzendConcept(c);
    if (r.methode) methoden.push(r.methode);
    else fouten[c.id] = r.fouten;
  }
  return { methoden, fouten };
}

/** "€ 4,95, gratis vanaf € 50,00 · In de hele EU · 1 tot 2 werkdagen", ook als het formulier half is ingevuld. */
export function verzendSamenvatting(c: VerzendConcept, bedrijfAdres: string): string {
  const r = leesVerzendConcept({ ...c, naam: c.naam || "x" });
  if (!r.methode) return "Nog niet compleet";
  const m = r.methode;
  const delen = [prijsTekst(m)];
  if (m.soort === "bezorgen") delen.push(GEBIED_TEKST[m.gebied]);
  else if (m.adres || bedrijfAdres) delen.push(m.adres || bedrijfAdres);
  if (m.levertijd) delen.push(m.levertijd);
  return delen.join(" · ");
}
