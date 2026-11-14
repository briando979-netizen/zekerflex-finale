import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { registerFreelancerCompany, registerTenantCompany } from "@/lib/company/registration";
import { koppelKvkAanAanmelder } from "@/lib/onboarding/employer";
import { kvkLimietVan } from "@/lib/kvk/tegoed";
import { wachtendeKvkControles, wisKvkOpgegeven, wisKvkWacht, zetKvkOpgegeven, zetKvkWacht } from "@/lib/kvk/tegoed-opslag";
import { kvSet } from "@/lib/storage/kv";
import { vulKvkWachtAan } from "@/lib/kvk/inhalen";

// ---------------------------------------------------------------------------
// De KVK-herkansing (13 nov 2026, cron /api/internal/kvk/herkansing, elke 30 minuten). Een KVK-controle die niet kon omdat
// het tegoed bij KVKBase op was of de minuutlimiet bereikt, staat in de wacht (lib/kvk/tegoed-opslag.ts). Is hij aan de
// beurt, dan doen we hem opnieuw, met dezelfde functies als de aanmelding:
//   werker:  registerFreelancerCompany → kvkValid op het profiel (en dus de poort voor betaald werk);
//   bedrijf: registerTenantCompany → de inschrijving, en daarna dezelfde koppeling aan de aanmelder als bij het aanmelden.
// Weer een limiet: hij schuift door (bij een op tegoed stopt de ronde meteen, zonder de rest te proberen). Een ander antwoord
// (niet gevonden, ongeldig): geen herkansing meer. Het nummer intussen veranderd: deze controle vervalt.
// ---------------------------------------------------------------------------

export const HERKANSING_PER_RONDE = 20;
/** De laatste uitslag van de herkansing, voor Beheer en het ochtendbericht: alleen aantallen en een tijdstip. */
export const KV_HERKANSING_METING = "meting:kvk-herkansing";

/** Bewaar de uitslag van een ronde (met tijdstip). Faalt open: een storing in de KV houdt de cron niet tegen. */
export async function bewaarHerkansingMeting(uitslag: HerkansingUitslag, nu: Date = new Date()): Promise<void> {
  await kvSet(KV_HERKANSING_METING, { at: nu.toISOString(), ...uitslag }).catch(() => undefined);
}

export interface HerkansingUitslag {
  /** werkers met een nog nooit gecontroleerd KVK-nummer die deze ronde in de wacht zijn gezet (lib/kvk/inhalen.ts) */
  ingehaald: number;
  aanDeBeurt: number;
  gelukt: number;
  weerInDeWacht: number;
  vervallen: number;
}

const isKvk = (v: string | null | undefined): v is string => /^\d{8}$/.test(v ?? "");

export async function kvkHerkansing(nu: Date = new Date()): Promise<HerkansingUitslag> {
  // eerst de werkers die buiten de wacht vielen (nummer ingevuld vóór 13 nov, of via /api/company/register bij een op tegoed)
  const { ingehaald } = await vulKvkWachtAan(nu);
  const alle = await wachtendeKvkControles();
  const beurt = alle.filter((w) => new Date(w.wacht.volgende).getTime() <= nu.getTime()).slice(0, HERKANSING_PER_RONDE);
  const uit: HerkansingUitslag = { ingehaald, aanDeBeurt: beurt.length, gelukt: 0, weerInDeWacht: 0, vervallen: 0 };

  for (const w of beurt) {
    try {
      if (w.soort === "werker") {
        const fp = await prisma.freelancerProfile.findUnique({ where: { userId: w.id }, select: { id: true, kvkNumber: true } });
        // het profiel is weg, of de werker vulde intussen een ander nummer in: deze controle is niet meer nodig
        if (!fp || (isKvk(fp.kvkNumber) && fp.kvkNumber !== w.wacht.kvkNumber)) {
          await wisKvkWacht("werker", w.id);
          uit.vervallen += 1;
          continue;
        }
        await registerFreelancerCompany({ freelancerProfileId: fp.id, kvkNumber: w.wacht.kvkNumber, allowInactive: true });
      } else {
        const t = await prisma.tenant.findUnique({
          where: { id: w.id },
          select: { id: true, kvkNumber: true, memberships: { where: { role: "HQ_ADMIN" }, orderBy: { createdAt: "asc" }, take: 1, select: { userId: true } } },
        });
        if (!t || (isKvk(t.kvkNumber) && t.kvkNumber !== w.wacht.kvkNumber)) {
          await wisKvkWacht("bedrijf", w.id);
          uit.vervallen += 1;
          continue;
        }
        const reg = await registerTenantCompany({ tenantId: t.id, kvkNumber: w.wacht.kvkNumber, allowInactive: true });
        const aanmelder = t.memberships[0]?.userId;
        if (reg.kvkValid && aanmelder) await koppelKvkAanAanmelder(t.id, aanmelder, reg.profile);
      }
      await wisKvkWacht(w.soort, w.id);
      await wisKvkOpgegeven(w.soort, w.id);
      uit.gelukt += 1;
    } catch (err) {
      const limiet = kvkLimietVan(err);
      if (limiet) {
        await zetKvkWacht(w.soort, w.id, w.wacht.kvkNumber, limiet, nu);
        uit.weerInDeWacht += 1;
        // tegoed nog op: de rest heeft geen zin vandaag (een 429 kost niets, maar een rij fouten zegt niets nieuws)
        if (limiet.soort === "tegoed") break;
        continue;
      }
      // opgegeven (niet gevonden, ongeldig): een merk op dit nummer, zodat het inhalen (lib/kvk/inhalen.ts) het niet elke
      // ronde opnieuw in de wacht zet en KVKBase opnieuw vraagt; een ander nummer telt wel weer
      await wisKvkWacht(w.soort, w.id);
      await zetKvkOpgegeven(w.soort, w.id, w.wacht.kvkNumber, nu);
      uit.vervallen += 1;
      logger.warn("kvk-herkansing: controle niet gelukt", { soort: w.soort, fout: (err as Error).message });
    }
  }
  return uit;
}
