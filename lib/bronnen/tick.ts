import { logger } from "@/lib/logger";
import { recordCronRun } from "@/lib/metrics";
import { alertOwner } from "@/lib/ops/alert";
import { BRONNEN, BRON_IDS, type BronId, type Meting } from "@/lib/bronnen/catalogus";
import { haalBron } from "@/lib/bronnen/haal";
import { alleLaatste, bewaarMeting, laatsteMeting, reeksVan } from "@/lib/bronnen/store";

// ---------------------------------------------------------------------------
// De planner van de bronnen: elk uur (cron) kijken welke bron aan de beurt is
// (laatste meting ouder dan zijn ritme, of mislukt), die ophalen en opslaan.
// Drie mislukkingen op rij → melding aan de eigenaar; een leeg scherm op de
// eigen site → meteen. Een gewijzigd minimumloon krijgt ook een melding.
// ---------------------------------------------------------------------------

/** Is deze bron aan de beurt? Mislukt = over een uur opnieuw proberen. */
export function aanDeBeurt(id: BronId, laatste: Meting | null, now = Date.now()): boolean {
  if (!laatste) return true;
  const uur = laatste.ok ? BRONNEN[id].elkeUur : 1;
  // een onleesbaar tijdstip (NaN) zou de bron anders voorgoed overslaan: dan gewoon halen
  const op = Date.parse(laatste.op);
  return Number.isNaN(op) || now - op >= uur * 3_600_000 - 5 * 60_000;
}

async function naMeting(id: BronId, m: Meting, fouten: number): Promise<void> {
  if (!m.ok) {
    const meteen = id === "schermen" && m.waarden.leeg !== undefined; // de site zelf is niet in orde: niet wachten
    if (meteen || fouten >= 3) {
      await alertOwner({
        key: `bron:${id}`,
        title: meteen ? "Pagina's van de site tonen geen inhoud" : `Bron "${BRONNEN[id].naam}" lukt niet meer`,
        detail: `${m.fout || m.tekst} ${meteen ? "De browser-werker zag een leeg scherm of een foutpagina. Kijk meteen op de site en in Live zetten." : `Al ${fouten} keer mislukt. Meestal is de bron (${BRONNEN[id].bronNaam}) veranderd of tijdelijk onbereikbaar.`}`,
        severity: meteen ? "critical" : "warning",
        url: "/admin/bronnen",
      });
    }
    return;
  }
  if (id === "minimumloon") {
    // gewijzigd ten opzichte van de vorige geslaagde meting: dat raakt elk uurtarief op het platform
    const reeks = await reeksVan(id, 2);
    const vorige = reeks.length >= 2 ? reeks[reeks.length - 2] : null;
    if (vorige && vorige.waarden.uurloon21 !== m.waarden.uurloon21) {
      await alertOwner({
        key: "bron:minimumloon:gewijzigd",
        title: "Het wettelijk minimumuurloon is veranderd",
        detail: `Van € ${vorige.waarden.uurloon21} naar € ${m.waarden.uurloon21} per uur (21+). Controleer de tarieven en de uitzendvoorwaarden.`,
        severity: "warning",
        url: "/admin/bronnen",
      });
    }
  }
}

/** Eén bron nu ophalen en opslaan (knop in Admin). */
export async function haalEnBewaar(id: BronId): Promise<Meting> {
  const m = await haalBron(id);
  const fouten = await bewaarMeting(id, m);
  await naMeting(id, m, fouten);
  return m;
}

/** De cron: alles wat aan de beurt is, één voor één. */
export async function tick(now = Date.now()): Promise<{ gehaald: BronId[]; mislukt: BronId[] }> {
  const laatste = await alleLaatste();
  const gehaald: BronId[] = [];
  const mislukt: BronId[] = [];
  for (const id of BRON_IDS) {
    if (!aanDeBeurt(id, laatste[id], now)) continue;
    const m = await haalEnBewaar(id);
    (m.ok ? gehaald : mislukt).push(id);
    logger.info("bron opgehaald", { bron: id, ok: m.ok, ms: m.duurMs, fout: m.fout || undefined });
  }
  recordCronRun("bronnen", true);
  return { gehaald, mislukt };
}

/** Voor andere delen van de app: de laatste pompprijs (of null). */
export async function pompprijsVandaag(): Promise<{ datum: string; benzine: number; diesel: number; lpg: number } | null> {
  const m = await laatsteMeting("brandstof");
  if (!m?.ok) return null;
  const w = m.waarden;
  return typeof w.benzine === "number" && typeof w.datum === "string" ? { datum: w.datum, benzine: w.benzine, diesel: Number(w.diesel) || 0, lpg: Number(w.lpg) || 0 } : null;
}
