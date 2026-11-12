// ---------------------------------------------------------------------------
// Bank: wat er bij een transactie in het veld `voorstel` (JSON) wordt bewaard, en hoe je dat veilig terugleest (puur).
// Alleen id's, nummers, bedragen en redenen: nooit een naam of IBAN.
// ---------------------------------------------------------------------------

import type { Beslissing, Kandidaat, Voorstel } from "./matching-kern";

/** Waar de transactie uiteindelijk aan gekoppeld is. */
export type Koppeling = Voorstel | { soort: "kosten"; rekeningNummer: string };

export interface OpgeslagenVoorstel {
  versie: 1;
  /** korte uitleg in gewoon Nederlands */
  reden: string;
  kandidaten: Kandidaat[];
  gekozen: Kandidaat | null;
  gekoppeldAan?: Koppeling;
  /** door een mens gekoppeld of genegeerd (niet door de regels) */
  handmatig?: boolean;
  genegeerdReden?: string;
}

export function voorstelUitBeslissing(b: Beslissing): OpgeslagenVoorstel {
  return { versie: 1, reden: b.reden, kandidaten: b.kandidaten, gekozen: b.gekozen };
}

const SOORTEN = new Set(["factuur", "bon", "bon-betaald", "stripe"]);

function isKandidaat(x: unknown): x is Kandidaat {
  if (typeof x !== "object" || x === null) return false;
  const k = x as Record<string, unknown>;
  const v = k.voorstel as Record<string, unknown> | undefined;
  return (
    typeof k.zekerheid === "number" &&
    typeof k.reden === "string" &&
    typeof v === "object" &&
    v !== null &&
    typeof v.soort === "string" &&
    SOORTEN.has(v.soort)
  );
}

/** Leest het JSON-veld terug; alles wat niet klopt wordt genegeerd (een leeg voorstel), nooit een fout. */
export function leesVoorstel(json: unknown): OpgeslagenVoorstel {
  const leeg: OpgeslagenVoorstel = { versie: 1, reden: "", kandidaten: [], gekozen: null };
  if (typeof json !== "object" || json === null) return leeg;
  const o = json as Record<string, unknown>;
  const kandidaten = Array.isArray(o.kandidaten) ? o.kandidaten.filter(isKandidaat) : [];
  const uit: OpgeslagenVoorstel = {
    versie: 1,
    reden: typeof o.reden === "string" ? o.reden : "",
    kandidaten,
    gekozen: isKandidaat(o.gekozen) ? o.gekozen : null,
  };
  const g = o.gekoppeldAan as Record<string, unknown> | undefined;
  if (g && typeof g === "object" && typeof g.soort === "string") {
    if (g.soort === "kosten" && typeof g.rekeningNummer === "string") uit.gekoppeldAan = { soort: "kosten", rekeningNummer: g.rekeningNummer };
    else if (g.soort === "factuur" && typeof g.invoiceId === "string") {
      uit.gekoppeldAan = { soort: "factuur", invoiceId: g.invoiceId, nummer: typeof g.nummer === "string" ? g.nummer : "", openCents: typeof g.openCents === "number" ? g.openCents : 0 };
    } else if (g.soort === "bon" && typeof g.bonId === "string") {
      uit.gekoppeldAan = { soort: "bon", bonId: g.bonId, openCents: typeof g.openCents === "number" ? g.openCents : 0 };
    } else if (g.soort === "bon-betaald" && typeof g.bonId === "string" && typeof g.boekingId === "string") {
      uit.gekoppeldAan = { soort: "bon-betaald", bonId: g.bonId, boekingId: g.boekingId };
    }
  }
  if (o.handmatig === true) uit.handmatig = true;
  if (typeof o.genegeerdReden === "string") uit.genegeerdReden = o.genegeerdReden;
  return uit;
}
