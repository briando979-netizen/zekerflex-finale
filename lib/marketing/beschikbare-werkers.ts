import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Hoeveel flexwerkers staan er echt klaar? (27 nov 2026) Een bedrijf dat op /bedrijven komt zag nergens of er überhaupt
// iemand beschikbaar is; gemeten: 94 bezoeken op die pagina in 7 dagen en nul aanmeldingen. Dit telt alleen werkers die
// een bedrijf ook echt kan inhuren: ID gecontroleerd, account actief, e-mail bevestigd, geen test- of intern adres.
// Zelfde afspraak als lib/marketing/echte-klussen.ts: een storing of een te klein aantal telt als "niets te melden",
// zodat de site nooit iets belooft wat niet waar is. Eén telling per 5 minuten voor de hele server (via globalThis:
// Next bundelt routes apart, dus een gewone module-variabele bestaat per bundel).
// ---------------------------------------------------------------------------

const VERS_MS = 5 * 60_000;
/** Onder dit aantal zeggen we niets: dan is het geen bewijs maar een zwaktebod. */
export const MIN_OM_TE_TONEN = 10;

/** Interne en testadressen tellen niet mee als beschikbare werker. */
const NIET_ECHT = [".test", ".example", ".invalid", "@zekerflex.com"] as const;

type Stand = { aantal: number; op: number };
const g = globalThis as typeof globalThis & { __zfBeschikbareWerkers?: Stand };

/**
 * Het aantal inhuurbare flexwerkers, of null als we het niet weten of als het te weinig is om te noemen.
 * null betekent altijd: toon niets.
 */
export async function beschikbareWerkers(nu: number = Date.now()): Promise<number | null> {
  const vorige = g.__zfBeschikbareWerkers;
  if (vorige && nu - vorige.op < VERS_MS) return vorige.aantal >= MIN_OM_TE_TONEN ? vorige.aantal : null;
  let aantal = 0;
  try {
    aantal = await prisma.freelancerProfile.count({
      where: {
        user: {
          kycStatus: "VERIFIED",
          disabledAt: null,
          emailVerifiedAt: { not: null },
          AND: NIET_ECHT.map((deel) => ({ email: { not: { contains: deel } } })),
        },
      },
    });
  } catch (e) {
    logger.warn("beschikbare werkers tellen mislukt", { error: (e as Error).message });
    return null;
  }
  g.__zfBeschikbareWerkers = { aantal, op: nu };
  return aantal >= MIN_OM_TE_TONEN ? aantal : null;
}
