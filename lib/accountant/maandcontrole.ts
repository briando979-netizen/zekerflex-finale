// ---------------------------------------------------------------------------
// Maandcontrole en termijnen voor het scherm Beheer → Accountant. Leest de boekhouding alleen via
// b3's leesfuncties (lib/boekhouding/lezen.ts) en de termijnen via lib/boekhouding/deadlines.ts; de
// status van een termijn komt uit Te doen (handmatig afgevinkt). Schrijft niets.
// Alleen echte administraties: een testadministratie hoort niet in de controle.
// ---------------------------------------------------------------------------

import { administraties, boekingen, bonnenZonderBoeking, openPosten, proefbalans } from "@/lib/boekhouding/lezen";
import { deadlineLijst } from "@/lib/boekhouding/deadlines";
import { handmatigKlaar } from "@/lib/admin/owner-todos";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { dagenTussen, maandcontrole, vorigeMaand, type AdministratieControle, type MaandcontroleUitslag, type TermijnRij } from "@/lib/accountant/maandcontrole-kern";

export type { AdministratieControle, MaandcontroleUitslag, TermijnRij };

/** Zoveel boekingen leest de controle per maand (lezen.ts staat er hooguit 2000 toe). */
export const LIMIET = 1000;

export async function maandcontroleNu(nu: Date = new Date()): Promise<MaandcontroleUitslag> {
  const vandaag = amsterdamDayKey(nu);
  const { van, tot } = vorigeMaand(vandaag);
  const echte = (await administraties()).filter((a) => a.soort === "ECHT");

  const perAdministratie = await Promise.all(
    echte.map(async (a): Promise<AdministratieControle> => {
      const [rijen, balans, posten, bonnen] = await Promise.all([
        boekingen(a.id, van, tot, LIMIET),
        proefbalans(a.id, van, tot),
        openPosten(a.id, vandaag),
        bonnenZonderBoeking(a.id),
      ]);
      return {
        id: a.id,
        naam: a.naam,
        van,
        tot,
        aantalBoekingen: rijen.length,
        bevindingen: maandcontrole({ vandaag, boekingen: rijen, afgekapt: rijen.length >= LIMIET, proefbalans: balans, openPosten: posten, bonnen }),
      };
    }),
  );

  const klaar = await handmatigKlaar().catch(() => new Set<string>());
  const termijnen = deadlineLijst(nu).map((d): TermijnRij => {
    const dag = amsterdamDayKey(d.datum);
    return {
      sleutel: d.sleutel,
      titel: d.titel,
      dag,
      dagenTot: dagenTussen(vandaag, dag),
      wat: d.wat,
      waarschuwing: d.waarschuwing ?? null,
      bevestigDoor: d.bevestigDoor,
      klaar: klaar.has(d.sleutel),
    };
  });

  return { vandaag, administraties: perAdministratie, termijnen };
}
