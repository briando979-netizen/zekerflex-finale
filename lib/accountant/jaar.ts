// ---------------------------------------------------------------------------
// Jaarafsluiting (concept) per echte administratie, uit b3's leesfuncties (alleen lezen).
// De rekenkern staat in jaar-kern.ts; hier alleen het ophalen.
// ---------------------------------------------------------------------------

import { administraties, proefbalans } from "@/lib/boekhouding/lezen";
import { VROEGSTE_DAG, boekjaarGrenzen, jaarconcept, openVragen, type Jaarconcept } from "@/lib/accountant/jaar-kern";

export interface JaarAdministratie {
  id: string;
  naam: string;
  concept: Jaarconcept;
  vragen: string[];
}

export async function jaarOverzicht(jaar: number): Promise<JaarAdministratie[]> {
  const echte = (await administraties()).filter((a) => a.soort === "ECHT");
  return Promise.all(
    echte.map(async (a) => {
      const { van, tot } = boekjaarGrenzen(jaar, a.boekjaarStartMaand);
      const [totEind, ditJaar] = await Promise.all([proefbalans(a.id, VROEGSTE_DAG, tot), proefbalans(a.id, van, tot)]);
      const concept = jaarconcept({ jaar, van, tot, valuta: a.valuta, totEind, ditJaar });
      return { id: a.id, naam: a.naam, concept, vragen: openVragen(concept) };
    }),
  );
}
