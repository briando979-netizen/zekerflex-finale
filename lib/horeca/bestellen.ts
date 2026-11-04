// ---------------------------------------------------------------------------
// Bestellen in de horeca: een winkelmand (van de gast via de QR-code, of van de
// bediening) wordt een bestelling met vastgelegde regels. Prijs en naam komen
// altijd van de menukaart op de server, nooit van de gast. Daarna loopt de
// bestelling door de statussen; keuken en bar zien elk hun eigen regels.
// Puur, dus ook in de browser bruikbaar en los te testen.
// ---------------------------------------------------------------------------

export const MAX_AANTAL = 50;
export const MAX_REGELS = 40;

export type BestelStatus = "NIEUW" | "IN_BEREIDING" | "KLAAR" | "GESERVEERD" | "GEANNULEERD";

export const STATUS_LABEL: Record<BestelStatus, string> = {
  NIEUW: "Nieuw",
  IN_BEREIDING: "In bereiding",
  KLAAR: "Klaar",
  GESERVEERD: "Geserveerd",
  GEANNULEERD: "Geannuleerd",
};

/** De volgende stap op het keukenscherm, of null als de bestelling af is. */
export const VOLGENDE: Record<BestelStatus, BestelStatus | null> = {
  NIEUW: "IN_BEREIDING",
  IN_BEREIDING: "KLAAR",
  KLAAR: "GESERVEERD",
  GESERVEERD: null,
  GEANNULEERD: null,
};

export const VOLGENDE_KNOP: Partial<Record<BestelStatus, string>> = {
  NIEUW: "Start bereiding",
  IN_BEREIDING: "Klaar",
  KLAAR: "Geserveerd",
};

export const isOpen = (s: BestelStatus) => s !== "GESERVEERD" && s !== "GEANNULEERD";

export interface MandRegel {
  itemId: string;
  aantal: number;
  opmerking?: string | undefined;
}

export interface KaartItem {
  id: string;
  naam: string;
  prijsCent: number;
  beschikbaar: boolean;
  station: string;
}

/** Waar een regel staat: keuken en bar melden elk hun eigen regels klaar (lib/horeca/fasen.ts). */
export type Fase = "nieuw" | "gestart" | "klaar" | "geserveerd";

export interface BestelRegel {
  itemId: string;
  naam: string;
  prijsCent: number;
  aantal: number;
  opmerking: string;
  station: "keuken" | "bar";
  /** ontbreekt = nieuw */
  fase?: Fase;
  /** wanneer de regel klaar werd (ISO), voor de bereidingstijd */
  klaarOp?: string;
  /** wanneer de regel geserveerd werd (ISO); regels die samen gingen, hebben dezelfde tijd */
  geserveerdOp?: string;
}

/**
 * Maakt van de mand vastgelegde regels: onbekende of uitverkochte gerechten
 * geven een nette fout, gelijke gerechten met gelijke opmerking worden samengevoegd.
 */
export function bouwRegels(mand: readonly MandRegel[], kaart: readonly KaartItem[]): { regels: BestelRegel[]; totaalCent: number } | { fout: string } {
  if (!mand.length) return { fout: "Je mandje is leeg." };
  if (mand.length > MAX_REGELS) return { fout: "Dat zijn te veel regels voor één bestelling." };
  const perId = new Map(kaart.map((k) => [k.id, k]));
  const samen = new Map<string, BestelRegel>();
  for (const m of mand) {
    const k = perId.get(m.itemId);
    if (!k) return { fout: "Een gerecht staat niet (meer) op de kaart. Ververs de pagina." };
    if (!k.beschikbaar) return { fout: `${k.naam} is helaas uitverkocht.` };
    if (!Number.isInteger(m.aantal) || m.aantal < 1 || m.aantal > MAX_AANTAL) return { fout: `Kies een aantal van 1 tot ${MAX_AANTAL}.` };
    const opmerking = (m.opmerking ?? "").trim().slice(0, 140);
    const sleutel = `${k.id}|${opmerking}`;
    const al = samen.get(sleutel);
    const aantal = (al?.aantal ?? 0) + m.aantal;
    if (aantal > MAX_AANTAL) return { fout: `Kies een aantal van 1 tot ${MAX_AANTAL}.` };
    samen.set(sleutel, { itemId: k.id, naam: k.naam, prijsCent: k.prijsCent, aantal, opmerking, station: k.station === "bar" ? "bar" : "keuken" });
  }
  const regels = [...samen.values()];
  return { regels, totaalCent: regels.reduce((s, r) => s + r.prijsCent * r.aantal, 0) };
}

/** Wat een station (keuken of bar) van een bestelling ziet; "alles" = de hele bestelling. */
export const regelsVoor = (regels: readonly BestelRegel[], station: "alles" | "keuken" | "bar") =>
  station === "alles" ? [...regels] : regels.filter((r) => r.station === station);

/** Regels uit de database (Json) veilig terug naar BestelRegel[]. */
export function leesRegels(json: unknown): BestelRegel[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const x = r as Record<string, unknown>;
    if (typeof x.naam !== "string" || typeof x.prijsCent !== "number" || typeof x.aantal !== "number") return [];
    const regel: BestelRegel = {
      itemId: typeof x.itemId === "string" ? x.itemId : "",
      naam: x.naam,
      prijsCent: x.prijsCent,
      aantal: x.aantal,
      opmerking: typeof x.opmerking === "string" ? x.opmerking : "",
      station: x.station === "bar" ? "bar" : "keuken",
    };
    if (x.fase === "gestart" || x.fase === "klaar" || x.fase === "geserveerd") regel.fase = x.fase;
    if (typeof x.klaarOp === "string") regel.klaarOp = x.klaarOp;
    if (typeof x.geserveerdOp === "string") regel.geserveerdOp = x.geserveerdOp;
    return [regel];
  });
}
