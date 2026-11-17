import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import { GRATIS_DAGEN } from "@/lib/introducties/regels";

// ---------------------------------------------------------------------------
// De twee weken zonder platformkosten van een voorgesteld bedrijf (lib/introducties/regels.ts). Ze beginnen op de dag
// van het koppelen in Beheer → Sales; een dienst telt mee als de dag van de dienst (Amsterdam, niet UTC) erin valt.
// Diensten van vóór het koppelen blijven gewoon betaald: hun factuur kan al verstuurd zijn. Puur (alleen de klok van
// lib/time/amsterdam.ts): de goedkeuring (lib/timesheets/approve.ts), het beheer en de tests rekenen hetzelfde.
// ---------------------------------------------------------------------------

/** Op de factuurregel van een € 0-factuur in de gratis weken. */
export const INTRODUCTIE_FEE_REDEN = "introductie: eerste twee weken zonder platformkosten";

/** Dagen als "JJJJ-MM-DD" in Amsterdam: gratisVanaf hoort erbij, gratisTot niet meer (tot, niet tot en met). */
export interface VrijePeriode {
  gratisVanaf: string;
  gratisTot: string;
}

const DAG = /^\d{4}-\d{2}-\d{2}$/;
const twee = (n: number) => String(n).padStart(2, "0");
const dagVan = (d: Date) => `${d.getUTCFullYear()}-${twee(d.getUTCMonth() + 1)}-${twee(d.getUTCDate())}`;

/** De periode die begint op de Amsterdamse dag van het koppelen: die dag plus de 13 dagen erna. */
export function vrijePeriode(gekoppeldOp: Date, dagen: number = GRATIS_DAGEN): VrijePeriode {
  const p = amsterdamParts(gekoppeldOp);
  return {
    gratisVanaf: dagVan(new Date(Date.UTC(p.year, p.month - 1, p.day))),
    gratisTot: dagVan(new Date(Date.UTC(p.year, p.month - 1, p.day + dagen))),
  };
}

/** Valt de dienst (op de Amsterdamse dag van `gewerktOp`) in de gratis weken? Een kapotte of ontbrekende periode: nee. */
export function binnenVrijePeriode(p: Partial<VrijePeriode> | null | undefined, gewerktOp: Date): boolean {
  if (!p || typeof p.gratisVanaf !== "string" || typeof p.gratisTot !== "string") return false;
  if (!DAG.test(p.gratisVanaf) || !DAG.test(p.gratisTot) || Number.isNaN(gewerktOp.getTime())) return false;
  const dag = amsterdamDayKey(gewerktOp);
  return dag >= p.gratisVanaf && dag < p.gratisTot;
}

/** De laatste gratis dag ("JJJJ-MM-DD"), voor op het scherm: "geen platformkosten t/m …". */
export function laatsteGratisDag(p: VrijePeriode): string {
  const [j, m, d] = p.gratisTot.split("-").map(Number);
  return dagVan(new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1)));
}
