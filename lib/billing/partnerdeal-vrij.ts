import { kvGet, kvListValues, kvSetIfAbsent } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { binnenVrijePeriode, laatsteGratisDag, vrijePeriode, type VrijePeriode } from "@/lib/introducties/periode";

// ---------------------------------------------------------------------------
// De gratis maand van de Partnerdeal (18 nov 2026): een bedrijf dat via de campagne "Partnerdeal" ja zegt, betaalt de
// eerste 30 dagen geen platformkosten, in ruil voor een vermelding als partner. Anders dan een kosteloos account
// (lib/billing/comp.ts) gaat het alleen om de platformkosten per gewerkt uur, en het stopt vanzelf: een dienst telt mee
// als de dag van de dienst (Amsterdam) in de periode valt. Eén keer per bedrijf; een tweede keer geven verandert niets.
//   KV "partnerdeal-vrij:<tenantId>" → PartnerdealVrij (geen persoonsgegevens: een bedrijf, geen gebruiker)
// ---------------------------------------------------------------------------

export const PARTNERDEAL_DAGEN = 30;
/** Op de factuurregel van een € 0-factuur in de gratis maand. */
export const PARTNERDEAL_FEE_REDEN = "partnerdeal: eerste 30 dagen zonder platformkosten";
export const PARTNERDEAL_PREFIX = "partnerdeal-vrij:";

export interface PartnerdealVrij extends VrijePeriode {
  tenantId: string;
  bedrijf: string;
  at: string;
  door: string;
}

const sleutel = (tenantId: string) => `${PARTNERDEAL_PREFIX}${tenantId}`;

/**
 * Bij het goedkeuren van uren (lib/timesheets/approve.ts): valt deze dienst in de gratis maand van dit bedrijf? Kan de
 * opslag niet gelezen worden, dan gelden de gewone platformkosten (en een regel in het logboek): een goedkeuring blijft
 * nooit hangen op deze korting.
 */
export async function partnerdealZonderFee(tenantId: string, gewerktOp: Date): Promise<boolean> {
  try {
    return binnenVrijePeriode(await kvGet<PartnerdealVrij>(sleutel(tenantId)), gewerktOp);
  } catch (err) {
    logger.warn("partnerdeal: gratis maand niet te lezen, gewone platformkosten", { tenantId, error: (err as Error).message });
    return false;
  }
}

/** Geef een bedrijf de gratis maand, vanaf vandaag. Bestaat hij al, dan blijft de eerste staan (`nieuw: false`). */
export async function geefPartnerdeal(input: { tenantId: string; bedrijf: string; door: { userId: string; naam: string }; nu?: Date }): Promise<{ nieuw: boolean; deal: PartnerdealVrij }> {
  const nu = input.nu ?? new Date();
  const deal: PartnerdealVrij = { ...vrijePeriode(nu, PARTNERDEAL_DAGEN), tenantId: input.tenantId, bedrijf: input.bedrijf.slice(0, 160), at: nu.toISOString(), door: input.door.naam.slice(0, 120) };
  const nieuw = await kvSetIfAbsent(sleutel(input.tenantId), deal);
  if (!nieuw) {
    const bestaand = await kvGet<PartnerdealVrij>(sleutel(input.tenantId));
    return { nieuw: false, deal: bestaand ?? deal };
  }
  await recordAudit({
    category: "ADMIN",
    action: "billing.partnerdeal.granted",
    actorUserId: input.door.userId,
    summary: `${deal.bedrijf} betaalt t/m ${laatsteGratisDag(deal)} geen platformkosten (Partnerdeal, ${PARTNERDEAL_DAGEN} dagen)`,
    targetType: "tenant",
    targetId: input.tenantId,
  });
  return { nieuw: true, deal };
}

/** Alle bedrijven met een gratis maand, nieuwste eerst (ook de afgelopen periodes: zo zie je wie hem al kreeg). */
export async function lijstPartnerdeal(): Promise<PartnerdealVrij[]> {
  const rijen = await kvListValues<PartnerdealVrij>(PARTNERDEAL_PREFIX, 500).catch(() => []);
  return rijen.filter((r) => r && typeof r.tenantId === "string" && typeof r.gratisTot === "string").sort((a, b) => b.at.localeCompare(a.at));
}

/** De vlag (lib/flags) voor de automatische eerste maand gratis; standaard aan, uit = alleen nog met de hand via de Partnerdeal. */
export const EERSTE_MAAND_GRATIS_VLAG = "eerste-maand-gratis";

/**
 * Eerste maand gratis voor elk bedrijf (21 nov 2026, eigenaar: "zet op auto"): bij het goedkeuren van de eerste dienst van
 * een bedrijf dat nog geen gratis maand heeft, begint die vanzelf, vanaf de dag van die dienst (Amsterdam), 30 dagen. Dezelfde
 * opslag als de Partnerdeal, dus één keer per bedrijf (kvSetIfAbsent) en een al gegeven Partnerdeal blijft staan. Een storing
 * hier laat de goedkeuring nooit hangen: dan gelden de gewone platformkosten.
 */
export async function startEersteMaandGratis(input: { tenantId: string; bedrijf: string; eersteDienst: Date; nu?: Date }): Promise<boolean> {
  try {
    const deal: PartnerdealVrij = {
      ...vrijePeriode(input.eersteDienst, PARTNERDEAL_DAGEN),
      tenantId: input.tenantId,
      bedrijf: input.bedrijf.slice(0, 160),
      at: (input.nu ?? new Date()).toISOString(),
      door: "automatisch (eerste dienst)",
    };
    return await kvSetIfAbsent(sleutel(input.tenantId), deal);
  } catch (err) {
    logger.warn("eerste maand gratis: niet gestart, gewone platformkosten", { tenantId: input.tenantId, error: (err as Error).message });
    return false;
  }
}
