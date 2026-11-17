import { logger } from "@/lib/logger";
import { leesKoppeling } from "@/lib/introducties/kv";
import { binnenVrijePeriode } from "@/lib/introducties/periode";

/**
 * Bij het goedkeuren van uren (lib/timesheets/approve.ts): valt deze dienst in de twee weken zonder platformkosten van
 * een voorgesteld bedrijf? Alleen een bedrijf dat in Beheer → Sales aan een introductie is gekoppeld; voor elk ander
 * bedrijf verandert er niets. Kan de opslag niet gelezen worden, dan gelden de gewone platformkosten (en een regel in
 * het logboek): een goedkeuring blijft nooit hangen op deze korting.
 */
export async function introductieZonderFee(tenantId: string, gewerktOp: Date): Promise<boolean> {
  try {
    return binnenVrijePeriode(await leesKoppeling(tenantId), gewerktOp);
  } catch (err) {
    logger.warn("introductie: periode zonder platformkosten niet te lezen, gewone platformkosten", { tenantId, error: (err as Error).message });
    return false;
  }
}
