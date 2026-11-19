import { randomBytes } from "crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { blogLijst, isBerichtId, maakSlug, uniekeSlug, valideerBericht, type Bericht, type BerichtInvoer, type EigenBericht } from "@/lib/voorstel/smileyapp-blog-regels";

// ---------------------------------------------------------------------------
// Opslag van de eigen blogberichten van het SmileyApp-team. KV:
// voorstel-smileyapp:blog:<id>. Geen persoonsgegevens van bezoekers; alleen de
// naam van het teamlid dat het bericht het laatst bewaarde. De blogpagina's
// lezen zichtbareBerichten(): de vier vaste berichten plus wat gepubliceerd is.
// Lukt het lezen niet, dan staan alleen de vaste berichten er.
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-smileyapp:blog:";
const sleutel = (id: string) => `${PREFIX}${id}`;
/** Ruim genoeg voor een blog; houdt de lijst (en de KV) begrensd. */
export const BERICHTEN_MAX = 200;

/** Alle eigen berichten (ook concepten), laatst gewijzigd eerst: voor het beheer. */
export async function eigenBerichten(): Promise<EigenBericht[]> {
  return (await kvListValues<EigenBericht>(PREFIX, 500)).sort((a, b) => (a.gewijzigd < b.gewijzigd ? 1 : -1));
}

/** De berichten voor de site: vast plus gepubliceerd, nieuwste eerst. */
export async function zichtbareBerichten(nu = new Date()): Promise<Bericht[]> {
  return blogLijst(await eigenBerichten().catch(() => []), amsterdamDayKey(nu));
}

export async function berichtBijSlug(slug: string, nu = new Date()): Promise<Bericht | undefined> {
  return (await zichtbareBerichten(nu)).find((b) => b.slug === slug);
}

/** Maakt een nieuw bericht (zonder id) of wijzigt een bestaand; de slug blijft na het aanmaken gelijk. */
export async function bewaarBericht(id: string | undefined, invoer: BerichtInvoer, door: string, nu = new Date()): Promise<EigenBericht> {
  const controle = valideerBericht(invoer);
  if (!controle.ok) throw AppError.validation(controle.fout, { veld: controle.veld });
  const moment = nu.toISOString();
  if (id !== undefined) {
    const oud = isBerichtId(id) ? await kvGet<EigenBericht>(sleutel(id)) : null;
    if (!oud) throw AppError.notFound("Dit bericht bestaat niet (meer).");
    const bij: EigenBericht = { ...oud, ...controle.waarde, gewijzigd: moment, door };
    await kvSet(sleutel(id), bij);
    return bij;
  }
  const alle = await eigenBerichten();
  if (alle.length >= BERICHTEN_MAX) throw AppError.validation(`Er staan al ${BERICHTEN_MAX} berichten. Verwijder eerst een oud bericht.`);
  const nieuw: EigenBericht = {
    id: randomBytes(8).toString("hex"),
    slug: uniekeSlug(
      maakSlug(controle.waarde.titel),
      alle.map((b) => b.slug),
    ),
    ...controle.waarde,
    aangemaakt: moment,
    gewijzigd: moment,
    door,
  };
  await kvSet(sleutel(nieuw.id), nieuw);
  return nieuw;
}

export async function verwijderBericht(id: string): Promise<void> {
  const b = isBerichtId(id) ? await kvGet<EigenBericht>(sleutel(id)) : null;
  if (!b) throw AppError.notFound("Dit bericht bestaat niet (meer).");
  await kvDelete(sleutel(id));
}
