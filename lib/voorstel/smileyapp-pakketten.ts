import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { PAKKETTEN, type Pakket, type PakketId } from "@/lib/voorstel/smileyapp";
import { leesOverschrijvingen, metOverschrijvingen, valideerPakket, wijktAf, type Overschrijvingen, type PakketInvoer } from "@/lib/voorstel/smileyapp-pakket-regels";

// ---------------------------------------------------------------------------
// De pakketten van het SmileyApp-voorstel zoals de site ze toont: de standaard
// uit lib/voorstel/smileyapp.ts met de overschrijvingen uit het beheer eroverheen
// (KV voorstel-smileyapp:pakketten, één rij). Elke plek die een pakket of prijs
// toont (voorpagina, demo, contact, pakketkiezer, veelgestelde vragen en de
// chat) leest smileyappPakketten(), zodat ze nooit iets anders zeggen. Lukt het
// lezen niet, dan geldt de standaard: de site valt nooit om door de opslag.
// ---------------------------------------------------------------------------

const SLEUTEL = "voorstel-smileyapp:pakketten";

async function overschrijvingen(): Promise<Overschrijvingen> {
  return leesOverschrijvingen(await kvGet<unknown>(SLEUTEL));
}

export async function smileyappPakketten(): Promise<Pakket[]> {
  return metOverschrijvingen(await overschrijvingen().catch(() => ({})));
}

/** Voor het beheer: wat de site nu toont, en welke pakketten van de standaard afwijken. */
export async function pakkettenVoorBeheer(): Promise<{ pakketten: Pakket[]; standaard: readonly Pakket[]; aangepast: PakketId[] }> {
  const o = await overschrijvingen();
  return { pakketten: metOverschrijvingen(o), standaard: PAKKETTEN, aangepast: PAKKETTEN.filter((p) => o[p.id]).map((p) => p.id) };
}

/** Bewaart de wijziging van één pakket. Is alles weer gelijk aan de standaard, dan verdwijnt de overschrijving. */
export async function bewaarPakket(id: PakketId, invoer: PakketInvoer): Promise<void> {
  const controle = valideerPakket(invoer);
  if (!controle.ok) throw AppError.validation(controle.fout, { veld: controle.veld });
  const o = await overschrijvingen();
  if (wijktAf(id, controle.waarde)) o[id] = controle.waarde;
  else delete o[id];
  if (Object.keys(o).length) await kvSet(SLEUTEL, o);
  else await kvDelete(SLEUTEL);
}

/** Terug naar de standaard: één pakket, of (zonder id) alle pakketten. */
export async function herstelPakketten(id?: PakketId): Promise<void> {
  if (!id) return void (await kvDelete(SLEUTEL));
  const o = await overschrijvingen();
  delete o[id];
  if (Object.keys(o).length) await kvSet(SLEUTEL, o);
  else await kvDelete(SLEUTEL);
}
