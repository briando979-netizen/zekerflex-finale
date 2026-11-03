import { minuten } from "@/lib/voorstel/schwarzwald-planning";

// ---------------------------------------------------------------------------
// Begeleiders per groep: wie staat dubbel ingepland (twee groepen die
// tegelijk lopen), en per begeleider de groepen van een dag. Puur, dus ook in
// de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export interface Groep {
  id: string;
  datum: string;
  tijd: string;
  activiteit: string;
  status: string;
  begeleider?: string | undefined;
}

const sleutel = (naam: string) => naam.trim().toLowerCase();

/** Actieve groepen met een begeleider, per dag en begeleider bij elkaar. */
function perDagEnBegeleider<T extends Groep>(boekingen: T[]): T[][] {
  const m = new Map<string, T[]>();
  for (const b of boekingen) {
    if (!b.begeleider?.trim() || b.status === "geannuleerd") continue;
    const k = `${b.datum}|${sleutel(b.begeleider)}`;
    m.set(k, [...(m.get(k) ?? []), b]);
  }
  return [...m.values()];
}

/**
 * Per boeking ("datum-id") de andere groepen van dezelfde begeleider die
 * tegelijk lopen. Duur per activiteit in minuten (onbekend = 60).
 */
export function dubbelIngepland<T extends Groep>(boekingen: T[], duur: Record<string, number>): Map<string, T[]> {
  const uit = new Map<string, T[]>();
  const van = (b: T) => minuten(b.tijd);
  const tot = (b: T) => van(b) + (duur[b.activiteit] ?? 60);
  for (const groepen of perDagEnBegeleider(boekingen)) {
    for (const a of groepen) {
      const tegelijk = groepen.filter((b) => b !== a && van(a) < tot(b) && van(b) < tot(a));
      if (tegelijk.length) uit.set(`${a.datum}-${a.id}`, tegelijk);
    }
  }
  return uit;
}

/** Per begeleider de groepen (op tijd), voor de dagplanning; begeleiders op naam. */
export function perBegeleider<T extends Groep>(boekingen: T[]): { naam: string; groepen: T[] }[] {
  return perDagEnBegeleider(boekingen)
    .map((groepen) => ({ naam: groepen[0]?.begeleider?.trim() ?? "", groepen: [...groepen].sort((a, b) => a.tijd.localeCompare(b.tijd)) }))
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}
