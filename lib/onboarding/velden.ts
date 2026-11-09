// ---------------------------------------------------------------------------
// Veldcontrole voor het verificatieformulier van de werker (pure functies, ook
// in de browser). Dit is alleen om vóór het versturen per veld een duidelijke
// melding te geven; de server (app/api/onboarding/route.ts, lib/onboarding/verify.ts)
// blijft leidend en wordt hier niet versoepeld.
// ---------------------------------------------------------------------------

export type VeldSleutel = "postal" | "iban" | "kvk" | "vat" | "docNumber" | "expiry" | "name";

const POSTCODE = /^\s*\d{4}\s*[A-Za-z]{2}\s*$/;

/** IBAN-controlecijfer (MOD-97), voor het hele IBAN zonder spaties. */
export function ibanKlopt(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const omgezet = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const ch of omgezet) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1;
}

/** Sleutel van de foutmelding, of null als het veld goed is. `nu` voor testbaarheid. */
export function controleerVeld(veld: VeldSleutel, waarde: string, nu: Date = new Date()): VeldSleutel | null {
  const v = waarde.trim();
  switch (veld) {
    case "postal":
      return POSTCODE.test(v) ? null : "postal";
    case "iban":
      return ibanKlopt(v) ? null : "iban";
    case "kvk":
      return /^\d{8}$/.test(v.replace(/[\s.]/g, "")) ? null : "kvk";
    case "vat":
      return /^[A-Za-z]{2}[A-Za-z0-9]{2,12}$/.test(v.replace(/[\s.]/g, "")) ? null : "vat";
    case "docNumber":
      return /^[A-Za-z0-9]{4,20}$/.test(v) ? null : "docNumber";
    case "expiry": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "expiry";
      const [j, m, dag] = v.split("-").map(Number) as [number, number, number];
      const d = new Date(Date.UTC(j, m - 1, dag, 23, 59, 59));
      // een datum die niet bestaat (31 februari) rolt door naar een andere dag: dan klopt de datum niet
      const bestaat = d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === dag;
      return !bestaat || d.getTime() <= nu.getTime() ? "expiry" : null;
    }
    case "name":
      return v.length >= 2 && v.length <= 120 ? null : "name";
  }
}

/** Controleer meerdere velden tegelijk; geeft alleen de velden met een fout terug. */
export function controleerVelden(waarden: Partial<Record<VeldSleutel, string>>, nu: Date = new Date()): Partial<Record<VeldSleutel, VeldSleutel>> {
  const uit: Partial<Record<VeldSleutel, VeldSleutel>> = {};
  for (const [k, w] of Object.entries(waarden) as [VeldSleutel, string][]) {
    const f = controleerVeld(k, w ?? "", nu);
    if (f) uit[k] = f;
  }
  return uit;
}
