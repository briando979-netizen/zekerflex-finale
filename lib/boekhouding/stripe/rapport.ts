// ---------------------------------------------------------------------------
// Stripe: het rapport "Payout reconciliation" (csv-export uit het Stripe Dashboard) lezen (puur, zonder prisma).
// Een gratis weg zonder nieuwe Stripe-koppeling: de eigenaar exporteert het rapport en leest het hier in.
//
// LET OP, door een echt Stripe-exportbestand te bevestigen: de kolommen hieronder (payout_id, gross, fee, net, currency,
// created, description) komen uit onze kennis van de gangbare export, niet uit een echt bestand (het live Stripe-account
// staat dicht). Herkennen we de kopregel niet, dan zeggen we dat eerlijk ("Formaat niet herkend") in plaats van te gokken.
// Bedragen staan in het bestand in hele euro's met een punt of komma (12.50), in de code altijd gehele centen.
// De kolom description wordt bewust niet bewaard: daar kunnen namen in staan.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { kiesScheiding, splitsCsv } from "../bank/csv";
import { datumNaarDag } from "../bank/tekst";

export const STRIPE_RAPPORT_MAX_BYTES = 5 * 1024 * 1024;
export const STRIPE_RAPPORT_MAX_REGELS = 2000;

export interface StripeUitbetaling {
  /** het payout-id van Stripe ("po_…"), de idempotentiesleutel */
  payoutId: string;
  /** de Amsterdamse dag waarop de uitbetaling is aangemaakt */
  boekdag: string;
  /** wat van het Stripe-saldo af gaat, met teken (negatief = terugboeking) */
  grossCents: number;
  /** Stripe-kosten, met teken */
  feeCents: number;
  /** wat op de bank komt (gross - fee), met teken */
  netCents: number;
  valuta: string;
}

export interface RapportFout {
  regel: number;
  fout: string;
}

export interface StripeRapport {
  uitbetalingen: StripeUitbetaling[];
  fouten: RapportFout[];
}

const KOPPEN = {
  payoutId: ["payout_id", "payout id", "id"],
  gross: ["gross", "gross amount"],
  fee: ["fee", "fees"],
  net: ["net", "net amount"],
  valuta: ["currency"],
  datum: ["created", "created (utc)", "created_utc", "created date (utc)", "date"],
} as const;

const PAYOUT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;

const koptekst = (k: string): string => k.replace(/^﻿/, "").replace(/\s+/g, " ").trim().toLowerCase();

function kolom(kop: readonly string[], namen: readonly string[]): number {
  for (const naam of namen) {
    const i = kop.indexOf(naam);
    if (i >= 0) return i;
  }
  return -1;
}

/** "12.50", "12,5", "-3.10", "1234" naar gehele centen; meer dan twee decimalen of een duizendtalteken is geen bedrag. */
export function stripeBedragNaarCenten(ruw: string): number | null {
  const s = ruw.replace(/\s/g, "");
  const m = /^([+-]?)(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const centen = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(centen)) return null;
  return m[1] === "-" ? -centen : centen;
}

/** Stripe geeft tijden in UTC, vaak zonder zone ("2026-11-02 08:12:00"): dat is UTC, de boekdag is de Amsterdamse dag. */
function dagVan(ruw: string): string | null {
  const s = ruw.trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/.exec(s);
  if (m) {
    const t = new Date(`${m[1]}T${m[2]}${m[3] ?? ":00"}Z`);
    return Number.isNaN(t.getTime()) ? null : amsterdamDayKey(t);
  }
  return datumNaarDag(s);
}

/**
 * Leest het csv-rapport. Een onbekende kopregel gooit "Formaat niet herkend"; een regel die niet klopt komt in `fouten`
 * en de rest wordt wel gelezen. Dezelfde payout twee keer met dezelfde bedragen telt één keer.
 */
export function parseStripePayoutRapport(csv: string): StripeRapport {
  const tekst = csv.replace(/^﻿/, "");
  if (!tekst.trim()) throw AppError.validation("Het bestand is leeg.");
  const alle = splitsCsv(tekst, kiesScheiding(tekst));
  const eerste = alle[0] ?? [];
  const kop = eerste.map(koptekst);
  const k = {
    payoutId: kolom(kop, KOPPEN.payoutId),
    gross: kolom(kop, KOPPEN.gross),
    fee: kolom(kop, KOPPEN.fee),
    net: kolom(kop, KOPPEN.net),
    valuta: kolom(kop, KOPPEN.valuta),
    datum: kolom(kop, KOPPEN.datum),
  };
  if (Object.values(k).some((i) => i < 0)) {
    const gezien = kop.slice(0, 8).map((x) => x.slice(0, 30)).join(", ");
    throw AppError.validation(
      `Formaat niet herkend. We verwachten het Stripe-rapport "Payout reconciliation" als csv met de kolommen payout_id, gross, fee, net, currency en created. De eerste kolommen van dit bestand zijn: ${gezien || "(geen)"}.`,
    );
  }
  const data = alle.slice(1);
  if (data.length === 0) throw AppError.validation("Het bestand heeft een kopregel maar geen uitbetalingen.");
  if (data.length > STRIPE_RAPPORT_MAX_REGELS) {
    throw AppError.validation(`Het rapport heeft meer dan ${STRIPE_RAPPORT_MAX_REGELS} regels. Exporteer een kortere periode.`);
  }

  const cel = (r: readonly string[], i: number): string => (r[i] ?? "").trim();
  const uitbetalingen: StripeUitbetaling[] = [];
  const fouten: RapportFout[] = [];
  const perId = new Map<string, StripeUitbetaling>();
  data.forEach((r, i) => {
    const regel = i + 2;
    const fout = (tekst2: string) => fouten.push({ regel, fout: tekst2 });
    const payoutId = cel(r, k.payoutId);
    if (!PAYOUT_ID.test(payoutId)) return fout("het payout-id is niet te lezen.");
    const grossCents = stripeBedragNaarCenten(cel(r, k.gross));
    const feeCents = stripeBedragNaarCenten(cel(r, k.fee) || "0");
    const netCents = stripeBedragNaarCenten(cel(r, k.net));
    if (grossCents === null || feeCents === null || netCents === null) return fout("een bedrag (gross, fee of net) is niet te lezen.");
    if (grossCents - feeCents !== netCents) return fout("gross min fee is niet gelijk aan net.");
    const valuta = cel(r, k.valuta).toUpperCase();
    if (!/^[A-Z]{3}$/.test(valuta)) return fout("de valuta is niet te lezen.");
    const boekdag = dagVan(cel(r, k.datum));
    if (!boekdag) return fout("de datum (created) is niet te lezen.");
    const uitbetaling: StripeUitbetaling = { payoutId, boekdag, grossCents, feeCents, netCents, valuta };
    const eerder = perId.get(payoutId);
    if (eerder) {
      if (JSON.stringify(eerder) !== JSON.stringify(uitbetaling)) fout("dit payout-id staat al eerder in het bestand met andere bedragen.");
      return;
    }
    perId.set(payoutId, uitbetaling);
    uitbetalingen.push(uitbetaling);
  });
  return { uitbetalingen, fouten };
}
