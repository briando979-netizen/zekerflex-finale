import { dienstenVan, isDatum, openDiensten, plusDagen, type Dienst, type NietBeschikbaar, type Planning, type Ruil, type Uur, type Verlof } from "@/lib/horeca-personeel/planning";
import type { PersoneelData } from "@/lib/horeca-personeel/model";

// Wat een medewerker van de planning te zien krijgt: zijn eigen diensten, de open diensten, aanbiedingen van collega's, en
// alleen zijn eigen niet-beschikbaar, verlof en uren. Nooit de regels van een collega, behalve de dienst die die collega
// zelf aanbiedt (met zijn voornaam). Puur, zodat het los te testen is.

export interface RuilMetDienst {
  ruil: Ruil;
  dienst: Dienst;
  /** de voornaam van wie de dienst afstaat of overneemt */
  vanNaam: string;
  naarNaam: string;
}

export interface MedewerkerPlanning {
  vandaag: string;
  diensten: Dienst[];
  open: Dienst[];
  /** diensten van collega's die zijn aangeboden aan het team of aan mij */
  aanbiedingen: RuilMetDienst[];
  /** mijn eigen verzoeken (aangeboden, geaccepteerd of net besloten) */
  mijnRuilen: RuilMetDienst[];
  nietBeschikbaar: NietBeschikbaar[];
  verlof: Verlof[];
  uren: Uur[];
  /** is hij nu ingeklokt? */
  ingeklokt: Uur | null;
}

const voornaam = (d: PersoneelData, id: string | null): string => {
  if (!id) return "";
  const n = d.medewerkers.find((m) => m.id === id)?.naam ?? "";
  return n.split(" ")[0] ?? n;
};

export function planningVoorMedewerker(p: Planning, d: PersoneelData, medewerkerId: string, vandaag: string): MedewerkerPlanning {
  const metDienst = (r: Ruil): RuilMetDienst | null => {
    const dienst = p.diensten.find((x) => x.id === r.dienstId);
    return dienst ? { ruil: r, dienst, vanNaam: voornaam(d, r.van), naarNaam: voornaam(d, r.naar) } : null;
  };
  const vanaf = plusDagen(vandaag, -7);
  const lijst = (rs: Ruil[]): RuilMetDienst[] => rs.map(metDienst).filter((x): x is RuilMetDienst => x !== null);
  return {
    vandaag,
    diensten: dienstenVan(p, medewerkerId, vanaf, 49),
    open: openDiensten(p, vandaag, 42),
    aanbiedingen: lijst(p.ruilen.filter((r) => r.status === "aangeboden" && r.van !== null && r.van !== medewerkerId && (r.naar === null || r.naar === medewerkerId))).filter((x) => x.dienst.datum >= vandaag),
    mijnRuilen: lijst(p.ruilen.filter((r) => r.van === medewerkerId || r.naar === medewerkerId)).filter((x) => x.dienst.datum >= vanaf).slice(-30),
    nietBeschikbaar: p.nietBeschikbaar.filter((n) => n.medewerkerId === medewerkerId && n.datum >= vanaf).sort((a, b) => (a.datum < b.datum ? -1 : 1)),
    verlof: p.verlof.filter((v) => v.medewerkerId === medewerkerId && v.tot >= vanaf).sort((a, b) => (a.van < b.van ? -1 : 1)),
    uren: p.uren
      .filter((u) => u.medewerkerId === medewerkerId && isDatum(u.datum) && u.datum >= plusDagen(vandaag, -35))
      .sort((a, b) => (a.datum + a.in < b.datum + b.in ? 1 : -1)),
    ingeklokt: p.uren.find((u) => u.medewerkerId === medewerkerId && u.uit === null) ?? null,
  };
}
