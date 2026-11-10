// ---------------------------------------------------------------------------
// "Maak een goede eerste indruk" (11 nov 2026): OPTIONELE stappen na de ID-controle,
// profielfoto, werkervaring en (10 nov, meting: 4 van de 51 werkers kregen pushmeldingen)
// meldingen aanzetten. Puur bestand: de stappenlijst en het tellen. De feiten komen uit
// lib/onboarding/eerste-indruk-server.ts, het scherm is /dashboard/eerste-indruk.
//
// Deze stappen blokkeren nooit het reageren op klussen: de poort (werker-poort.ts) en de
// controles vóór werk (lib/fiscal/eligibility.ts) blijven los hiervan.
// ---------------------------------------------------------------------------

export type EersteIndrukStapId = "foto" | "ervaring" | "meldingen";

/** klaar = gedaan; actief = nu aan de beurt; wacht = pas na de vorige stap */
export type EersteIndrukStapStatus = "klaar" | "actief" | "wacht";

export interface EersteIndrukFeiten {
  heeftFoto: boolean;
  aantalErvaringen: number;
  /** "Ik heb nog geen werkervaring" gekozen */
  geenErvaring: boolean;
  /** meldingen komen aan (een web-push-abonnement of de iPhone-app), of er valt hier niets aan te zetten */
  heeftMeldingen: boolean;
}

export interface EersteIndrukStap {
  id: EersteIndrukStapId;
  status: EersteIndrukStapStatus;
}

export interface EersteIndrukStand {
  stappen: EersteIndrukStap[];
  /** aantal stappen dat nog open staat */
  open: number;
  alleKlaar: boolean;
}

export function eersteIndrukStand(f: EersteIndrukFeiten): EersteIndrukStand {
  const klaar: Record<EersteIndrukStapId, boolean> = {
    foto: f.heeftFoto,
    ervaring: f.aantalErvaringen > 0 || f.geenErvaring,
    meldingen: f.heeftMeldingen,
  };
  const volgorde: EersteIndrukStapId[] = ["foto", "ervaring", "meldingen"];
  let actiefGezet = false;
  const stappen = volgorde.map<EersteIndrukStap>((id) => {
    if (klaar[id]) return { id, status: "klaar" };
    if (!actiefGezet) {
      actiefGezet = true;
      return { id, status: "actief" };
    }
    return { id, status: "wacht" };
  });
  const open = stappen.filter((s) => s.status !== "klaar").length;
  return { stappen, open, alleKlaar: open === 0 };
}

/** De stap om mee te beginnen: de gevraagde (als die bestaat), anders de eerste open stap, anders de foto. */
export function startStap(stand: EersteIndrukStand, gevraagd?: string | null): EersteIndrukStapId {
  const ids = stand.stappen.map((s) => s.id);
  if (gevraagd && (ids as string[]).includes(gevraagd)) return gevraagd as EersteIndrukStapId;
  return stand.stappen.find((s) => s.status !== "klaar")?.id ?? "foto";
}
