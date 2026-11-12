import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { UITZEND_NIEUW } from "@/lib/agreements/uitzend-nieuw-teksten";
import { CONTRACTEN_PREFIX, SJABLOON_HUIDIG, sjabloonVan, type UitzendContract } from "@/lib/agreements/uitzend-contract";

// ---------------------------------------------------------------------------
// Uitzendkrachten die alleen nog een geldige overeenkomst in een oudere versie hebben (v1, tot 12 nov 2026), moeten de nieuwe lezen en
// tekenen. Dit telt hoeveel er zijn (droog: alleen aantallen, niets verstuurd) en meldt ze één keer met een push in hun app-taal.
// Nooit voor een testadres; per werker één keer (KV "uitzend-v2-melding:<userId>", wordt bij wissen van het account ook gewist).
// ---------------------------------------------------------------------------

export const MELDING_PREFIX = "uitzend-v2-melding:";

export interface MeldingTelling {
  /** werkers met een nog geldige overeenkomst in een oudere versie en zonder geldige huidige */
  oudeVersie: number;
  /** daarvan: testadres of geblokkeerd account (die krijgen niets) */
  overgeslagen: number;
  /** daarvan: al eerder gemeld */
  alGemeld: number;
  /** nu te melden */
  teMelden: number;
  /** alleen bij versturen: pushes die een apparaat bereikten */
  bereikt: number;
  /** alleen bij versturen: werkers aan wie een push is gestuurd */
  verstuurd: number;
}

export async function meldUitzendBijgewerkt(opts: { verstuur: boolean; nu?: number }): Promise<MeldingTelling> {
  const nu = opts.nu ?? Date.now();
  const uit: MeldingTelling = { oudeVersie: 0, overgeslagen: 0, alGemeld: 0, teMelden: 0, bereikt: 0, verstuurd: 0 };
  const rijen = await kvListEntries<UitzendContract[]>(CONTRACTEN_PREFIX, 5000);
  const kandidaten: string[] = [];
  for (const r of rijen) {
    const lijst = Array.isArray(r.value) ? r.value : [];
    const geldig = lijst.filter((c) => new Date(c.validUntil).getTime() > nu);
    if (geldig.length === 0 || geldig.some((c) => sjabloonVan(c) === SJABLOON_HUIDIG)) continue;
    if (!geldig.some((c) => sjabloonVan(c) < SJABLOON_HUIDIG)) continue;
    kandidaten.push(r.key.slice(CONTRACTEN_PREFIX.length));
  }
  uit.oudeVersie = kandidaten.length;
  if (kandidaten.length === 0) return uit;

  const gebruikers = await prisma.user.findMany({ where: { id: { in: kandidaten } }, select: { id: true, email: true, disabledAt: true } });
  const geschikt = new Map(gebruikers.filter((u) => !u.disabledAt && !isReservedTestAddress(u.email)).map((u) => [u.id, u]));
  for (const id of kandidaten) {
    if (!geschikt.has(id)) {
      uit.overgeslagen += 1;
      continue;
    }
    if (await kvGet(`${MELDING_PREFIX}${id}`)) {
      uit.alGemeld += 1;
      continue;
    }
    uit.teMelden += 1;
    if (!opts.verstuur) continue;
    try {
      const bereikt = await sendLocalizedPush([id], (_t, locale) => {
        const tekst = UITZEND_NIEUW[locale];
        return {
          title: tekst.pushTitel,
          body: tekst.pushBody,
          data: { type: "uitzend-bijgewerkt", url: "/dashboard/verificatie#uitzendovereenkomst", tag: "uitzend-v2" },
          ttlSeconds: 3 * 24 * 60 * 60,
        };
      });
      await kvSet(`${MELDING_PREFIX}${id}`, { at: new Date(nu).toISOString(), bereikt });
      uit.verstuurd += 1;
      uit.bereikt += bereikt;
    } catch (err) {
      logger.warn("uitzend v2 melding mislukt", { error: (err as Error).message });
    }
  }
  return uit;
}
