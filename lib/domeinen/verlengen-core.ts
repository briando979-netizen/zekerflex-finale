// ---------------------------------------------------------------------------
// Domeinnamen verlengen (pure regels, zonder database). Elk jaar verlengt het
// register de naam op de verlengdatum en factureert ZekerFlex. ZekerFlex
// factureert de klant daarom ruim vooraf:
//   35 dagen voor   verlengfactuur (met opgeslagen betaalmethode: automatisch afschrijven)
//   21 dagen voor   uiterste betaaldatum, herinnering 1
//   14 en 10 dagen  herinnering 2 en 3
//    8 dagen voor   laatste waarschuwing: "anders zeggen we hem op"
//    7 dagen voor   nog niet betaald → opzeggen bij het register (loopt af op de verlengdatum)
// Wie "niet verlengen" kiest, krijgt geen factuur; de naam wordt dan 7 dagen
// vooraf opgezegd. De opslag en de mails staan in lib/domeinen/verlengen.ts.
// ---------------------------------------------------------------------------

const DAG = 86_400_000;

export const FACTUUR_DAGEN_VOOR = 35;
export const VERVAL_DAGEN_VOOR = 21;
/** herinnering 1..4 (index + 1), op zoveel dagen voor de verlengdatum; de laatste is de waarschuwing */
export const HERINNERING_DAGEN_VOOR = [21, 14, 10, 8] as const;
export const LAATSTE_HERINNERING = HERINNERING_DAGEN_VOOR.length;
export const OPZEG_DAGEN_VOOR = 7;
/** Hoeveel namen ZekerFlex per dag vanzelf vastlegt (vangnet tegen misbruik met gestolen kaarten). */
export const AUTO_REGISTREREN_PER_DAG = 25;

export type FactuurStand = "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";

export type VerlengActie =
  | { soort: "niets" }
  | { soort: "factuur" }
  | { soort: "herinnering"; stap: number }
  | { soort: "opzeggen"; reden: "onbetaald" | "op-verzoek" };

/** Hele dagen tot de verlengdatum (negatief = voorbij). */
export const dagenTot = (verlooptOp: Date, nu: Date): number => Math.floor((verlooptOp.getTime() - nu.getTime()) / DAG);

/** Welke herinnering hoort bij dit moment (0 = nog geen). */
export function herinneringVoor(dagen: number): number {
  let stap = 0;
  HERINNERING_DAGEN_VOOR.forEach((d, i) => {
    if (dagen <= d) stap = i + 1;
  });
  return stap;
}

/**
 * Wat er vandaag moet gebeuren voor één vastgelegde naam. `factuur` is de
 * verlengfactuur voor de komende periode (null = nog niet gemaakt) en
 * `herinneringStap` de laatste herinnering die al verstuurd is.
 */
export function verlengActie(input: { verlooptOp: Date; autoVerlengen: boolean; factuur: FactuurStand | null; herinneringStap: number; nu: Date }): VerlengActie {
  const dagen = dagenTot(input.verlooptOp, input.nu);
  if (!input.autoVerlengen) {
    // de klant wil hem niet houden: geen factuur, op tijd opzeggen
    return dagen <= OPZEG_DAGEN_VOOR ? { soort: "opzeggen", reden: "op-verzoek" } : { soort: "niets" };
  }
  if (input.factuur === "PAID") return { soort: "niets" };
  if (dagen > FACTUUR_DAGEN_VOOR) return { soort: "niets" };
  if (input.factuur === null || input.factuur === "CANCELLED" || input.factuur === "DRAFT") {
    // nooit opzeggen zonder dat de klant een factuur en een laatste waarschuwing kreeg
    return { soort: "factuur" };
  }
  // factuur staat open
  if (dagen <= OPZEG_DAGEN_VOOR && input.herinneringStap >= LAATSTE_HERINNERING) return { soort: "opzeggen", reden: "onbetaald" };
  // te laat begonnen (bijvoorbeeld een gemiste dag): eerst nog de laatste waarschuwing
  const nodig = dagen <= OPZEG_DAGEN_VOOR ? LAATSTE_HERINNERING : herinneringVoor(dagen);
  if (nodig > input.herinneringStap) return { soort: "herinnering", stap: nodig };
  return { soort: "niets" };
}

/** De uiterste betaaldatum van een verlengfactuur. */
export const vervaldatum = (verlooptOp: Date): Date => new Date(verlooptOp.getTime() - VERVAL_DAGEN_VOOR * DAG);
/** De dag waarop ZekerFlex een onbetaalde naam opzegt. */
export const opzegdatum = (verlooptOp: Date): Date => new Date(verlooptOp.getTime() - OPZEG_DAGEN_VOOR * DAG);

/** Eén jaar later, op dezelfde kalenderdag (29 februari → 28 februari). */
export function jaarLater(d: Date): Date {
  const y = d.getUTCFullYear() + 1;
  const m = d.getUTCMonth();
  const dag = Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
  return new Date(Date.UTC(y, m, dag, d.getUTCHours(), d.getUTCMinutes()));
}

/** "2026-11-05" (TransIP renewalDate) → middag UTC op die dag, zodat de Nederlandse datum altijd klopt. */
export function leesDatum(s: string | undefined | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "5 november 2026" */
export const datumNl = (d: Date): string => d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });

/** Periode op de factuur: "5 november 2026 t/m 4 november 2027". */
export function periodeTekst(van: Date, tot: Date): string {
  return `${datumNl(van)} t/m ${datumNl(new Date(tot.getTime() - DAG))}`;
}

/** Testbestellingen (RFC 2606-adressen, ook example.com zoals live tests gebruiken) komen nooit bij het register of Stripe. */
export const isTestAdres = (email: string): boolean => /@(?:[^@\s]+\.)*(?:[^@\s.]+\.(?:test|example|invalid|localhost)|example\.(?:com|net|org))$/i.test(email.trim());
