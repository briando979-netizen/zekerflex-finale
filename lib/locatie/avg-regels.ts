// ---------------------------------------------------------------------------
// Verwijderen van één persoon uit de Op locatie-gegevens (AVG). Puur bestand,
// zodat de regels getest kunnen worden zonder database. De KV-kant staat in
// lib/locatie/avg.ts. Een kentekenregel of een logregel van een persoon wordt
// geschrapt; het logboek van het bedrijf blijft, maar zonder naam of userId.
// ---------------------------------------------------------------------------

export interface RegistratieRegel {
  userId?: string;
  naam: string;
  [sleutel: string]: unknown;
}

export interface LogRegel {
  userId?: string;
  naam?: string;
  [sleutel: string]: unknown;
}

/** Haal de kentekens van deze persoon uit de lijst van het bedrijf. Telt hoeveel er weg zijn. */
export function zuiverRegistraties(map: Record<string, RegistratieRegel>, userId: string): { map: Record<string, RegistratieRegel>; verwijderd: number } {
  const uit: Record<string, RegistratieRegel> = {};
  let verwijderd = 0;
  for (const [kenteken, reg] of Object.entries(map)) {
    if (reg.userId === userId) {
      verwijderd++;
      continue;
    }
    uit[kenteken] = reg;
  }
  return { map: uit, verwijderd };
}

/** Maak de naam en het userId uit elke logregel van deze persoon onherkenbaar; het moment en het besluit blijven. */
export function zuiverLog(log: LogRegel[], userId: string): { log: LogRegel[]; geraakt: number } {
  let geraakt = 0;
  const uit = log.map((r) => {
    if (r.userId !== userId) return r;
    geraakt++;
    const { naam: _n, userId: _u, ...rest } = r;
    void _n;
    void _u;
    return { ...rest, naam: "verwijderd", userId: "verwijderd" };
  });
  return { log: uit, geraakt };
}
