// Openingstijden van een horecazaak: per weekdag (0 = zondag) een van/tot in
// "UU:MM", of null = dicht. Een tot vóór de van loopt door na middernacht
// (bar tot 02:00). Puur, dus ook in de browser bruikbaar en los te testen.

export type Dag = "0" | "1" | "2" | "3" | "4" | "5" | "6";
export type Openingstijden = Record<Dag, { van: string; tot: string } | null>;

export const DAGEN: { dag: Dag; naam: string }[] = [
  { dag: "1", naam: "Maandag" },
  { dag: "2", naam: "Dinsdag" },
  { dag: "3", naam: "Woensdag" },
  { dag: "4", naam: "Donderdag" },
  { dag: "5", naam: "Vrijdag" },
  { dag: "6", naam: "Zaterdag" },
  { dag: "0", naam: "Zondag" },
];

/** Een nieuwe zaak: dinsdag t/m zondag open, maandag dicht. De zaak past dit zelf aan. */
export const STANDAARD_TIJDEN: Openingstijden = {
  "0": { van: "12:00", tot: "22:00" },
  "1": null,
  "2": { van: "12:00", tot: "22:00" },
  "3": { van: "12:00", tot: "22:00" },
  "4": { van: "12:00", tot: "22:00" },
  "5": { van: "12:00", tot: "23:00" },
  "6": { van: "12:00", tot: "23:00" },
};

export const isTijd = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Wat in de database staat, netjes gemaakt: onbekend of ongeldig = de standaard voor die dag. */
export function leesTijden(json: unknown): Openingstijden {
  const bron = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const uit = { ...STANDAARD_TIJDEN };
  for (const { dag } of DAGEN) {
    if (!(dag in bron)) continue;
    const v = bron[dag];
    if (v === null) uit[dag] = null;
    else if (v && typeof v === "object" && isTijd((v as { van?: unknown }).van) && isTijd((v as { tot?: unknown }).tot)) {
      const { van, tot } = v as { van: string; tot: string };
      if (van !== tot) uit[dag] = { van, tot };
    }
  }
  return uit;
}

/** "12:00 – 22:00" of "Gesloten". */
export const tijdTekst = (t: { van: string; tot: string } | null) => (t ? `${t.van} – ${t.tot}` : "Gesloten");
