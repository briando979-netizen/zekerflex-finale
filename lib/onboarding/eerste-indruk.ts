// ---------------------------------------------------------------------------
// "Maak een goede eerste indruk" (11 nov 2026): twee OPTIONELE stappen na de ID-controle,
// profielfoto en werkervaring. Puur bestand: de stappenlijst en het tellen. De feiten komen
// uit lib/onboarding/eerste-indruk-server.ts, het scherm is /dashboard/eerste-indruk.
//
// Deze stappen blokkeren nooit het reageren op klussen: de poort (werker-poort.ts) en de
// controles vóór werk (lib/fiscal/eligibility.ts) blijven los hiervan.
// ---------------------------------------------------------------------------

export type EersteIndrukStapId = "foto" | "ervaring";

/** klaar = gedaan; actief = nu aan de beurt; wacht = pas na de vorige stap */
export type EersteIndrukStapStatus = "klaar" | "actief" | "wacht";

export interface EersteIndrukFeiten {
  heeftFoto: boolean;
  aantalErvaringen: number;
  /** "Ik heb nog geen werkervaring" gekozen */
  geenErvaring: boolean;
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
  };
  const volgorde: EersteIndrukStapId[] = ["foto", "ervaring"];
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
