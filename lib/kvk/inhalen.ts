import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { wachtendeKvkControles, zetKvkWachtNu } from "@/lib/kvk/tegoed-opslag";

// ---------------------------------------------------------------------------
// KVK-controles inhalen (14 nov 2026). Een werker met een KVK-nummer maar zonder geslaagde controle
// (kvkValid=false, vatValid=false, geen CompanyRegistration) is voor de matching nooit geschikt
// (lib/matching/geschikt.ts) en krijgt dus nooit een voorstel, via geen enkel kanaal. Op 14 nov waren
// dat 6 van de 25 klare werkers; 4 van hen vulden hun nummer in vóór de wachtrij bestond (a561dd66,
// 13 nov) of via /api/company/register, dat bij een op tegoed niets in de wacht zette. Daarom vult de
// herkansingscron (lib/kvk/herkansing.ts) de wacht eerst aan met zulke werkers, begrensd, en zonder
// zelf bij KVKBase aan te kloppen: de controle zelf gebeurt pas in de herkansing, die het tegoed
// respecteert. Alles faalt open: een storing houdt de herkansing niet tegen.
// ---------------------------------------------------------------------------

/** Hooguit zoveel werkers per ronde in de wacht zetten (de herkansing doet er 20 per ronde). */
export const INHALEN_PER_RONDE = 50;

const isKvk = (v: string | null | undefined): v is string => /^\d{8}$/.test(v ?? "");

/** Werkers met een KVK-nummer dat nog nooit met succes is gecontroleerd. */
export const ZONDER_CONTROLE_WHERE: Prisma.FreelancerProfileWhereInput = {
  kvkValid: false,
  vatValid: false,
  companyRegistration: { is: null },
  // kvkNumber is een verplichte kolom: leeg = geen nummer; de vorm (8 cijfers) controleert kiesInTeHalen
  kvkNumber: { not: "" },
  user: { disabledAt: null },
};

export interface InhaalUitslag {
  /** werkers zonder controle met een bruikbaar nummer */
  kandidaten: number;
  /** daarvan nieuw in de wacht gezet (de rest stond er al) */
  ingehaald: number;
}

/** Puur: wie komt er in de wacht? Alleen een geldig nummer, nog niet wachtend, hooguit `max`. */
export function kiesInTeHalen(
  profielen: readonly { userId: string; kvkNumber: string | null }[],
  wachtend: ReadonlySet<string>,
  max = INHALEN_PER_RONDE,
): { kandidaten: number; nieuw: { userId: string; kvkNumber: string }[] } {
  const geldig = profielen.filter((p): p is { userId: string; kvkNumber: string } => isKvk(p.kvkNumber));
  const nieuw = geldig.filter((p) => !wachtend.has(p.userId)).slice(0, Math.max(0, max));
  return { kandidaten: geldig.length, nieuw };
}

/** Vul de KVK-wacht aan met werkers zonder controle. Geen aanroep naar KVKBase; bij een storing 0. */
export async function vulKvkWachtAan(nu: Date = new Date()): Promise<InhaalUitslag> {
  try {
    const profielen = await prisma.freelancerProfile.findMany({
      where: ZONDER_CONTROLE_WHERE,
      select: { userId: true, kvkNumber: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    const wachtend = new Set((await wachtendeKvkControles()).filter((w) => w.soort === "werker").map((w) => w.id));
    const { kandidaten, nieuw } = kiesInTeHalen(profielen, wachtend);
    for (const p of nieuw) await zetKvkWachtNu("werker", p.userId, p.kvkNumber, nu);
    if (nieuw.length) logger.info("kvk-wacht aangevuld met werkers zonder controle", { aantal: nieuw.length });
    return { kandidaten, ingehaald: nieuw.length };
  } catch (err) {
    logger.warn("kvk-wacht aanvullen mislukt (gaat later opnieuw)", { fout: (err as Error).message.slice(0, 120) });
    return { kandidaten: 0, ingehaald: 0 };
  }
}

/** Hoeveel werkers een KVK-nummer hebben dat nog nooit is gecontroleerd (voor Admin → Te doen); bij een storing 0. */
export async function telWerkersZonderKvkControle(): Promise<number> {
  try {
    return await prisma.freelancerProfile.count({ where: ZONDER_CONTROLE_WHERE });
  } catch {
    return 0;
  }
}
