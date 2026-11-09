import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// De gegevens van een buitenlands bedrijf dat zich als opdrachtgever aanmeldde. Tenant heeft al
// country en vatNumber; een registratienummer van buiten de EU en de uitslag van de btw-controle
// staan hier. Zo'n bedrijf telt als aangemeld, maar blijft ongeverifieerd tot een beheerder het
// goedkeurt (lib/company/verified.ts): één testklus, niemand inplannen.
// ---------------------------------------------------------------------------

export interface BuitenlandBewijs {
  land: string;
  /** EU: het btw-nummer is in VIES gecontroleerd. "niet-bereikbaar": VIES lag eruit, de beheerder kijkt zelf. */
  btw: "geldig" | "niet-bereikbaar" | null;
  /** Buiten de EU: vrije tekst, zoals de aanmelder het invulde. */
  registratieNummer: string | null;
  at: string;
}

const sleutel = (tenantId: string) => `tenant-buitenland:${tenantId}`;

export async function setBuitenlandBewijs(tenantId: string, bewijs: BuitenlandBewijs): Promise<void> {
  await kvSet(sleutel(tenantId), bewijs);
}

export async function getBuitenlandBewijs(tenantId: string): Promise<BuitenlandBewijs | null> {
  return kvGet<BuitenlandBewijs>(sleutel(tenantId));
}
