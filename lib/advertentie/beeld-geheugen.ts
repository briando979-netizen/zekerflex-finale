// ---------------------------------------------------------------------------
// Een klein geheugen voor de WATERMERK-beelden van de advertentie op maat en de
// logo maker: de pagina van een bezoeker laadt er drie of zes tegelijk en elk
// beeld kost rekentijd, dus herladen hoeft niet opnieuw te renderen. Hooguit 200
// beelden (400), elk hooguit tien minuten; het langst ongebruikte valt eraf.
//
// Alleen de versie met watermerk komt hierin. Schone beelden (na vrijgave of voor
// een beheerder) worden nooit gedeeld: die maakt de route elke keer zelf, na zijn
// eigen controle. De inhoud van een voorbeeld hangt alleen af van wat bij het
// maken is ingevuld (dat verandert niet meer), dus een bewaard beeld is nooit oud.
// Op globalThis, omdat Next elke route apart bundelt. Puur (geen kv, geen prisma).
// ---------------------------------------------------------------------------

export const GEHEUGEN_MAX = 400;
export const GEHEUGEN_MS = 600_000;

interface Vak {
  op: number;
  beeld: Promise<ArrayBuffer>;
}

const g = globalThis as typeof globalThis & { __zfWatermerkBeelden?: Map<string, Vak> };
const vakken = (): Map<string, Vak> => (g.__zfWatermerkBeelden ??= new Map());

/** Het watermerkbeeld bij deze sleutel: uit het geheugen, of met `maak` gemaakt en bewaard. Een mislukte poging blijft niet staan. */
export async function watermerkBeeld(sleutel: string, maak: () => Promise<ArrayBuffer>, nu = Date.now()): Promise<ArrayBuffer> {
  const m = vakken();
  const oud = m.get(sleutel);
  if (oud && nu - oud.op < GEHEUGEN_MS) {
    // opnieuw achteraan: het langst ongebruikte staat vooraan
    m.delete(sleutel);
    m.set(sleutel, oud);
    return (await oud.beeld).slice(0);
  }
  const vak: Vak = { op: nu, beeld: maak() };
  m.delete(sleutel);
  m.set(sleutel, vak);
  while (m.size > GEHEUGEN_MAX) {
    const eerste = m.keys().next().value;
    if (eerste === undefined) break;
    m.delete(eerste);
  }
  try {
    return (await vak.beeld).slice(0);
  } catch (e) {
    if (m.get(sleutel) === vak) m.delete(sleutel);
    throw e;
  }
}

/** Voor de test. */
export const geheugenGrootte = (): number => vakken().size;
export const leegGeheugen = (): void => vakken().clear();
