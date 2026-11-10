import { kvGet, kvSet } from "@/lib/storage/kv";
import { maakInstellingen, type Instellingen } from "@/lib/hardware/catalogus";

// De keuzes van de eigenaar bij de apparatuur (marge, eigen verkoopprijzen, wat niet in de verkoop is,
// de prijs van de installatie). Eén blok in de KV, geen schema nodig. Het zijn bedrijfsgegevens, geen
// gegevens van een persoon, dus niet in de AVG-lijst voor gebruikers.

const SLEUTEL = "hardware:instellingen";

export async function getInstellingen(): Promise<Instellingen> {
  return maakInstellingen(await kvGet<unknown>(SLEUTEL));
}

export async function setInstellingen(invoer: unknown): Promise<Instellingen> {
  const schoon = maakInstellingen(invoer);
  await kvSet(SLEUTEL, { ...schoon, bijgewerkt: new Date().toISOString() });
  return schoon;
}
