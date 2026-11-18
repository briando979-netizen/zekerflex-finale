import { kvDelete, kvDeleteStale, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { opDatum, type NieuwsBericht } from "@/lib/nieuws/regels";

// Opslag van de nieuwsroom in KV (geen persoonsgegevens: berichten over openbaar nieuws).
//   nieuws:bericht:<slug>  — een bericht (concept, geplaatst of verborgen)
//   nieuws:gezien:<hash>   — een item uit een feed dat al bekeken is (ook als het niet paste), na 60 dagen weg
//   meting:nieuws          — de uitslag van de laatste ronde, voor Beheer

export const NIEUWS_PREFIX = "nieuws:bericht:";
export const NIEUWS_GEZIEN_PREFIX = "nieuws:gezien:";
export const KV_NIEUWS_STAND = "meting:nieuws";
const DAG = 86_400_000;

export interface NieuwsStand {
  at: string;
  vanzelf: boolean;
  bekeken: number;
  paste: number;
  geschreven: number;
  geplaatst: number;
  afgekeurd: { titel: string; reden: string }[];
  fout?: string;
}

export const leesBericht = (slug: string) => kvGet<NieuwsBericht>(`${NIEUWS_PREFIX}${slug}`);
export const bewaarBericht = (b: NieuwsBericht) => kvSet(`${NIEUWS_PREFIX}${b.slug}`, b);
export const wisBericht = (slug: string) => kvDelete(`${NIEUWS_PREFIX}${slug}`);

/** Alle berichten, nieuwste eerst. */
export async function alleBerichten(): Promise<NieuwsBericht[]> {
  return (await kvListValues<NieuwsBericht>(NIEUWS_PREFIX, 500)).filter((b) => b && typeof b.slug === "string").sort(opDatum);
}

/** Wat een bezoeker ziet: alleen geplaatste berichten. Bij een storing in de opslag een lege lijst (de pagina blijft staan). */
export async function geplaatsteBerichten(): Promise<NieuwsBericht[]> {
  return (await alleBerichten().catch(() => [])).filter((b) => b.status === "geplaatst");
}

const sleutelVoor = (id: string) => `${NIEUWS_GEZIEN_PREFIX}${Buffer.from(id).toString("base64url").slice(0, 120)}`;
export const isGezien = async (id: string) => (await kvGet<{ at: string }>(sleutelVoor(id)).catch(() => null)) !== null;
export const zetGezien = (id: string, nu: Date) => kvSet(sleutelVoor(id), { at: nu.toISOString() });

export const leesNieuwsStand = () => kvGet<NieuwsStand>(KV_NIEUWS_STAND).catch(() => null);
export const bewaarNieuwsStand = (s: NieuwsStand) => kvSet(KV_NIEUWS_STAND, s);
export const ruimNieuwsOp = (nu: number) => kvDeleteStale(NIEUWS_GEZIEN_PREFIX, new Date(nu - 60 * DAG)).catch(() => 0);
