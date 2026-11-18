import { prisma } from "@/lib/prisma";
import { createCampaign } from "@/lib/sales/campaign";
import { beoordeelCampagneTekst } from "@/lib/sales/campagne-tekst";
import { bewaarCampagneTekst, leesCampagneTekst } from "@/lib/sales/campagne-tekst-opslag";
import { PARTNER_CAMPAGNE, PARTNER_SOORTEN, type PartnerSoortId } from "@/lib/sales/partner-soorten";

// De campagnes voor partners (lib/sales/partner-soorten.ts) aanmaken en hun stand lezen. Een campagne per soort, herkend aan zijn naam,
// dus opnieuw drukken maakt er geen tweede. Ze beginnen als concept: status DRAFT en stand REVIEW (de defaults van createCampaign);
// de eigenaar zet ze zelf actief in Beheer, Sales, en verstuurt elke mail zelf met "Verstuur nu".

export interface PartnerStand {
  id: PartnerSoortId;
  label: string;
  waarom: string;
  campagneNaam: string;
  campagneId: string | null;
  status: string | null;
  mode: string | null;
  heeftTekst: boolean;
}

export async function partnerStand(): Promise<PartnerStand[]> {
  const rijen = await prisma.salesCampaign.findMany({ where: { name: { in: PARTNER_SOORTEN.map((s) => s.campagneNaam) } }, select: { id: true, name: true, status: true, mode: true } });
  return Promise.all(
    PARTNER_SOORTEN.map(async (s) => {
      const c = rijen.find((r) => r.name === s.campagneNaam) ?? null;
      return {
        id: s.id,
        label: s.label,
        waarom: s.waarom,
        campagneNaam: s.campagneNaam,
        campagneId: c?.id ?? null,
        status: c?.status ?? null,
        mode: c?.mode ?? null,
        heeftTekst: c ? (await leesCampagneTekst(c.id)) !== null : false,
      };
    }),
  );
}

/** Maakt de ontbrekende partnercampagnes aan, elk met zijn vaste tekst. Geeft terug welke nieuw zijn en welke er al waren. */
export async function maakPartnerCampagnes(door: { id: string; email: string }): Promise<{ aangemaakt: string[]; bestond: string[] }> {
  const aangemaakt: string[] = [];
  const bestond: string[] = [];
  for (const s of PARTNER_SOORTEN) {
    // de tekst moet door dezelfde controle als elke andere campagnetekst; een fout hier is een fout in onze eigen tekst
    const oordeel = beoordeelCampagneTekst(s.tekst);
    if (!oordeel.goed) throw new Error(`De tekst voor "${s.label}" voldoet niet: ${oordeel.redenen.join(" ")}`);
    const bestaande = await prisma.salesCampaign.findFirst({ where: { name: s.campagneNaam }, select: { id: true } });
    if (bestaande) {
      if ((await leesCampagneTekst(bestaande.id)) === null) await bewaarCampagneTekst(bestaande.id, s.tekst, door.email);
      bestond.push(s.campagneNaam);
      continue;
    }
    const campagne = await createCampaign({
      name: s.campagneNaam,
      targetSectors: [s.sector],
      minScore: PARTNER_CAMPAGNE.minScore,
      dailyCap: PARTNER_CAMPAGNE.dailyCap,
      workdaysOnly: PARTNER_CAMPAGNE.workdaysOnly,
      createdById: door.id,
    });
    await bewaarCampagneTekst(campagne.id, s.tekst, door.email);
    aangemaakt.push(s.campagneNaam);
  }
  return { aangemaakt, bestond };
}
