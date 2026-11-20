// ---------------------------------------------------------------------------
// Werkgever → Facturen: de instellingen voor de boekhouder (factuur-e-mail,
// PO-nummers, aparte factuur per kostenplaats, e-factuur) staan in één
// inklapblok. Dat blok is standaard dicht, behalve als het bedrijf er al iets
// heeft ingevuld: dan lijkt niemand zijn eigen instellingen kwijt.
// Puur bestand (geen prisma/kv), zodat het los te testen is.
// ---------------------------------------------------------------------------

export interface BoekhoudInstellingen {
  billingEmail?: string | undefined;
  splitByCostCentre?: boolean | undefined;
  costCentres?: string[] | undefined;
  efactuur?:
    | {
        peppolId?: string | undefined;
        ontvangstEmail?: string | undefined;
        automatisch?: boolean | undefined;
      }
    | undefined;
}

/** Heeft het bedrijf al iets ingevuld bij de instellingen voor de boekhouding? */
export function boekhoudingIngevuld(b: BoekhoudInstellingen): boolean {
  if (b.billingEmail?.trim()) return true;
  if (b.splitByCostCentre === true) return true;
  if ((b.costCentres ?? []).some((c) => c.trim().length > 0)) return true;
  const e = b.efactuur;
  if (!e) return false;
  return Boolean(e.peppolId?.trim() || e.ontvangstEmail?.trim() || e.automatisch === true);
}

/** De drie telvakken (openstaand, betaald, aantal) zeggen pas iets als er een factuur is. */
export function toonFactuurTellers(aantalFacturen: number): boolean {
  return aantalFacturen > 0;
}
