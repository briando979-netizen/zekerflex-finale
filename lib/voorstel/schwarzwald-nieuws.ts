import { randomBytes } from "crypto";
import { kvDelete, kvFindByField, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { isDatum } from "@/lib/voorstel/schwarzwald-agenda";
import { NIEUWS_FOTOS, maakSlug, uniekeSlug, zichtbaar } from "@/lib/voorstel/nieuws-regels";

// ---------------------------------------------------------------------------
// Nieuwsberichten die het team zelf schrijft (Beheer → Nieuws). Hun huidige
// /nieuws is leeg; hier kunnen ze berichten plaatsen, inplannen (latere datum)
// of als concept bewaren. De slug blijft na de eerste keer gelijk, zodat
// gedeelde links blijven werken. KV: voorstel-schwarzwald:nieuws:<id>
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-schwarzwald:nieuws:";

export interface Bericht {
  id: string;
  slug: string;
  titel: string;
  /** publicatiedatum JJJJ-MM-DD; later = ingepland */
  datum: string;
  samenvatting: string;
  /** alinea's gescheiden door een lege regel */
  tekst: string;
  /** pad van een van hun eigen foto's, of leeg */
  foto: string;
  gepubliceerd: boolean;
  aangemaakt: string;
  bijgewerkt: string;
}

export type BerichtInvoer = Pick<Bericht, "titel" | "datum" | "samenvatting" | "tekst" | "foto" | "gepubliceerd">;

const nieuwsteEerst = (a: Bericht, b: Bericht) => b.datum.localeCompare(a.datum) || b.aangemaakt.localeCompare(a.aangemaakt);

export async function alleBerichten(): Promise<Bericht[]> {
  return (await kvListValues<Bericht>(PREFIX, 2000)).sort(nieuwsteEerst);
}

export async function zichtbareBerichten(): Promise<Bericht[]> {
  const vandaag = amsterdamDayKey(new Date());
  return (await alleBerichten()).filter((b) => zichtbaar(b, vandaag));
}

/** Alleen als hij op de site zichtbaar is (gepubliceerd en de datum is bereikt). */
export async function zichtbaarBericht(slug: string): Promise<Bericht | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const b = (await kvFindByField<Bericht>(PREFIX, "slug", slug, 1))[0];
  return b && zichtbaar(b, amsterdamDayKey(new Date())) ? b : null;
}

export async function slaBerichtOp(invoer: BerichtInvoer, id?: string | undefined): Promise<Bericht> {
  if (!isDatum(invoer.datum)) throw AppError.validation("Kies een geldige datum.");
  if (invoer.foto && !NIEUWS_FOTOS.some((f) => f.pad === invoer.foto)) throw AppError.validation("Kies een foto uit de lijst.");
  const nu = new Date().toISOString();
  const schoon = { ...invoer, titel: invoer.titel.trim(), samenvatting: invoer.samenvatting.trim(), tekst: invoer.tekst.trim() };
  if (id) {
    if (!/^[a-z0-9]{6,24}$/.test(id)) throw AppError.validation("Onbekend bericht.");
    const oud = await kvGet<Bericht>(`${PREFIX}${id}`);
    if (!oud) throw AppError.notFound("Bericht niet gevonden.");
    const nieuw: Bericht = { ...oud, ...schoon, bijgewerkt: nu };
    await kvSet(`${PREFIX}${id}`, nieuw);
    return nieuw;
  }
  const slug = uniekeSlug(
    maakSlug(schoon.titel),
    (await alleBerichten()).map((b) => b.slug),
  );
  const b: Bericht = { ...schoon, id: `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`, slug, aangemaakt: nu, bijgewerkt: nu };
  await kvSet(`${PREFIX}${b.id}`, b);
  return b;
}

export async function verwijderBericht(id: string): Promise<void> {
  if (!/^[a-z0-9]{6,24}$/.test(id)) throw AppError.validation("Onbekend bericht.");
  await kvDelete(`${PREFIX}${id}`);
}
