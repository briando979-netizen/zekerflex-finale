// ---------------------------------------------------------------------------
// Types en teksten van de controle vóór het live zetten, zonder server-
// afhankelijkheden: ook in de client (LiveZetten) en in tests bruikbaar. De
// aanroepen naar de Bouwer staan in lib/bouwer/controles.ts.
// ---------------------------------------------------------------------------

export interface ControleKort {
  sha: string;
  kort: string;
  onderwerp: string;
  ok: boolean;
  tsc: boolean;
  /** het databaseschema (prisma validate); ontbreekt in oude uitslagen */
  schema?: boolean;
  eslint: boolean;
  tests: boolean;
  /** gewijzigde bestanden sinds de basis (live, of de vorige controle) */
  bestanden: number;
  door: string;
  begon: string;
  klaar: string;
  duurSec: number;
}

export interface ControleDeel {
  ok: boolean;
  uit: string;
  /** waarom dit deel niet draaide (bv. geen gewijzigde code); null = gedraaid */
  overgeslagen?: string | null;
}

export interface ControleUitslag extends Omit<ControleKort, "tsc" | "schema" | "eslint" | "tests"> {
  vanaf: string | null;
  tsc: ControleDeel;
  schema?: ControleDeel;
  eslint: ControleDeel;
  tests: ControleDeel;
}

export interface ControleBezig {
  doel: string;
  begon: string;
  door: string;
  stap: string;
}

export interface ControlesStand {
  bezig: ControleBezig | null;
  uitslagen: ControleKort[];
}

export function faaltOp(c: Pick<ControleKort, "tsc" | "eslint" | "tests"> & { schema?: boolean | undefined }): string[] {
  return [...(c.tsc ? [] : ["TypeScript"]), ...(c.schema === false ? ["het databaseschema"] : []), ...(c.eslint ? [] : ["eslint"]), ...(c.tests ? [] : ["de tests"])];
}

export function duurKort(sec: number): string {
  if (sec < 60) return `${sec} s`;
  return `${Math.round(sec / 60)} min`;
}

/** "schoon in 4 min" / "faalt op TypeScript en de tests (6 min)". */
export function controleTekst(c: Pick<ControleKort, "ok" | "tsc" | "eslint" | "tests" | "duurSec"> & { schema?: boolean | undefined }): string {
  if (c.ok) return `schoon in ${duurKort(c.duurSec)}`;
  const delen = faaltOp(c);
  const lijst = delen.length > 1 ? `${delen.slice(0, -1).join(", ")} en ${delen[delen.length - 1]}` : (delen[0] ?? "een onderdeel");
  return `faalt op ${lijst} (${duurKort(c.duurSec)})`;
}
