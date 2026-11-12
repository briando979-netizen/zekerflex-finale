// ---------------------------------------------------------------------------
// Bank: tekst, bedragen, datums en IBAN's uit een bankbestand (puur).
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { isGeldigeBoekdag } from "../sluiting";

/**
 * Bytes naar tekst: UTF-8 (met of zonder BOM) of UTF-16 (met BOM); is het geen geldige UTF-8, dan Windows-1252, zoals oude
 * exports van banken en Excel. De BOM valt weg.
 */
export function bytesNaarTekst(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const zonderBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(zonderBom);
  } catch {
    return new TextDecoder("windows-1252").decode(zonderBom);
  }
}

/**
 * Een bedrag uit een bestand naar gehele centen, met teken. Kent "1.234,56", "1,234.56", "1234,56", "-12,50", "+12,50",
 * "12,50-", "(12,50)" en "12". Een scheidingsteken met precies drie cijfers erachter en geen ander scheidingsteken is een
 * duizendtal ("1.234" is 1234). Geeft null als het geen bedrag is.
 */
export function bedragNaarCenten(ruw: string): number | null {
  let s = ruw.replace(/[\s €]/g, "").replace(/EUR/gi, "");
  if (!s) return null;
  let negatief = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negatief = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negatief = !negatief;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) {
    negatief = !negatief;
    s = s.slice(0, -1);
  }
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return null;

  const laatste = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  let hele = s;
  let deel = "";
  if (laatste >= 0) {
    const na = s.slice(laatste + 1);
    const teken = s[laatste];
    const kommas = s.split(",").length - 1;
    const punten = s.split(".").length - 1;
    // Drie cijfers na het enige scheidingsteken (en maar één keer aanwezig of van een ander soort) = duizendtal.
    const alsDuizendtal = na.length === 3 && (teken === "," ? kommas === 1 && punten === 0 : punten === 1 && kommas === 0);
    const meerdere = (teken === "," && kommas > 1) || (teken === "." && punten > 1);
    if (meerdere) {
      // "1.234.567": alleen duizendtallen, geen decimalen
      if (!s.split(teken ?? ",").slice(1).every((g) => g.length === 3)) return null;
    } else if (!alsDuizendtal) {
      if (na.length < 1 || na.length > 2) return null;
      hele = s.slice(0, laatste);
      deel = na;
    }
  }
  const cijfers = hele.replace(/[.,]/g, "");
  if (!/^\d+$/.test(cijfers)) return null;
  const centen = Number(cijfers) * 100 + Number(deel.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(centen)) return null;
  return negatief ? -centen : centen;
}

/**
 * Een datum uit een bestand naar een dagsleutel "2026-04-10". Kent 20260410, 2026-04-10, 10-04-2026, 10/04/2026,
 * 10.04.2026 en een tijdstip met zone ("2026-04-10T23:30:00+00:00": de Amsterdamse dag). Geen jaartallen van twee cijfers.
 */
export function datumNaarDag(ruw: string): string | null {
  const s = ruw.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const dag = `${m[1]}-${m[2]}-${m[3]}`;
    return isGeldigeBoekdag(dag) ? dag : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const dag = `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
    return isGeldigeBoekdag(dag) ? dag : null;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const heeftZone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
    // Zonder zone is het al de lokale dag (de bank noemt dan de dag zelf).
    if (!heeftZone) return datumNaarDag(s.slice(0, 10));
    const t = new Date(s);
    return Number.isNaN(t.getTime()) ? null : amsterdamDayKey(t);
  }
  return null;
}

// ---- IBAN ------------------------------------------------------------------

/** Hoofdletters zonder spaties. */
export function normaliseerIban(ruw: string): string {
  return ruw.replace(/\s+/g, "").toUpperCase();
}

/** Klopt het controlegetal (ISO 13616, modulo 97) en de lengte-vorm van deze IBAN? */
export function isGeldigIban(ruw: string): boolean {
  const iban = normaliseerIban(ruw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const herschikt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const teken of herschikt) {
    const waarde = teken >= "A" && teken <= "Z" ? String(teken.charCodeAt(0) - 55) : teken;
    for (const cijfer of waarde) rest = (rest * 10 + Number(cijfer)) % 97;
  }
  return rest === 1;
}

/** Een IBAN die geldig moet zijn (Nederlandse foutmelding), genormaliseerd. */
export function eisGeldigIban(ruw: string): string {
  const iban = normaliseerIban(ruw);
  if (!isGeldigIban(iban)) {
    throw AppError.validation("Dit is geen geldig IBAN: het controlegetal klopt niet. Controleer het nummer (bijvoorbeeld NL91 ABNA 0417 1643 00).");
  }
  return iban;
}

/** "NL•• •••• •••• 4300": alleen de laatste vier tekens zijn te zien. */
export function maskeerIban(iban: string | null | undefined): string {
  if (!iban) return "";
  const schoon = normaliseerIban(iban);
  if (schoon.length <= 4) return "••••";
  return `${schoon.slice(0, 2)}•• •••• •••• ${schoon.slice(-4)}`;
}

/** Een IBAN uit een bestand als het geldig is, anders null (een oud rekeningnummer of een rommelveld is geen IBAN). */
export function ibanOfNull(ruw: string | null | undefined): string | null {
  if (!ruw) return null;
  const iban = normaliseerIban(ruw);
  return isGeldigIban(iban) ? iban : null;
}

/** Spaties samenvoegen, afkappen; leeg wordt null. */
export function schoonTekst(ruw: string | null | undefined, max = 500): string | null {
  if (ruw === null || ruw === undefined) return null;
  const s = ruw.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}
