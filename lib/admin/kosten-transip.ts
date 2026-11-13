import { listInvoices, transipConfigured } from "@/lib/mail/hosting/transip";
import { facturenPerMaand, type TransipFacturen } from "@/lib/admin/kosten";
export type { TransipFacturen };

// ---------------------------------------------------------------------------
// De gemeten TransIP-facturen voor Beheer -> Kosten. Alleen lezen, hooguit een keer per uur (geheugen via globalThis:
// Next bundelt routes apart), en een storing laat de rest van de pagina gewoon staan. Er verlaat nooit iets van het
// token deze module: alleen bedragen, factuurnummers en datums.
// ---------------------------------------------------------------------------

const TTL_MS = 60 * 60_000;
const TTL_FOUT_MS = 5 * 60_000;
const MAX_MAANDEN = 12;

const g = globalThis as unknown as { __zfKostenTransip?: { at: number; ttl: number; uitslag: TransipFacturen } };

/** De facturen van de laatste 12 maanden, uit het geheugen als ze minder dan een uur oud zijn. */
export async function transipFacturen(nu = Date.now()): Promise<TransipFacturen> {
  const c = g.__zfKostenTransip;
  if (c && nu - c.at < c.ttl) return c.uitslag;
  let uitslag: TransipFacturen;
  let ttl = TTL_MS;
  if (!transipConfigured()) {
    uitslag = { ok: false, melding: "De TransIP-koppeling staat niet aan, dus er zijn geen gemeten facturen." };
  } else {
    try {
      const alle = await listInvoices();
      const grens = new Date(nu);
      grens.setUTCMonth(grens.getUTCMonth() - MAX_MAANDEN);
      const sinds = grens.toISOString().slice(0, 10);
      const facturen = alle.filter((f) => f.datum >= sinds);
      uitslag = { ok: true, facturen, perMaand: facturenPerMaand(facturen).slice(0, MAX_MAANDEN), gelezenOp: new Date(nu).toISOString() };
    } catch {
      // geen details: een fout van de koppeling kan een adres of token bevatten
      uitslag = { ok: false, melding: "TransIP is nu niet bereikbaar, probeer het later." };
      ttl = TTL_FOUT_MS;
    }
  }
  g.__zfKostenTransip = { at: nu, ttl, uitslag };
  return uitslag;
}
