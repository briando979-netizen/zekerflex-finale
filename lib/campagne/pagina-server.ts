import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import type { CampagnePagina } from "@/lib/campagne/pagina";

// Opslag van de campagnepagina's (lib/campagne/pagina.ts): key "campagne:pagina:<slug>" → CampagnePagina.
// Geen persoonsgegevens: alleen de tekst, de foto en de knop van een openbare pagina.

const PREFIX = "campagne:pagina:";

export async function campagnePaginas(): Promise<CampagnePagina[]> {
  const lijst = await kvListValues<CampagnePagina>(PREFIX, 200);
  return lijst.sort((a, b) => b.bijgewerkt.localeCompare(a.bijgewerkt));
}

export async function campagnePagina(slug: string): Promise<CampagnePagina | null> {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return null;
  return kvGet<CampagnePagina>(`${PREFIX}${slug}`);
}

export async function bewaarCampagnePagina(p: CampagnePagina): Promise<void> {
  await kvSet(`${PREFIX}${p.slug}`, p);
}

export async function verwijderCampagnePagina(slug: string): Promise<void> {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return;
  await kvDelete(`${PREFIX}${slug}`);
}
