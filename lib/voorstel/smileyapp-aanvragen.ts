import { randomBytes } from "crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import {
  NOTITIE_MAX,
  STATUS_NA_BOEKEN,
  aanvraagVerlopen,
  isAanvraagId,
  isNotitieId,
  metNotitie,
  type Aanvraag,
  type NieuweAanvraag,
  type Status,
} from "@/lib/voorstel/smileyapp-aanvraag-regels";

// ---------------------------------------------------------------------------
// Opslag van demo-aanvragen en partner-aanmeldingen van het SmileyApp-voorstel.
// KV: voorstel-smileyapp:aanvraag:<id>. Ze gaan alleen naar het eigen beheer;
// er gaat niets naar derden. Een aanvraag vervalt twaalf maanden na de laatste
// wijziging: dat ruimt het lezen van de lijst op.
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-smileyapp:aanvraag:";
const sleutel = (id: string) => `${PREFIX}${id}`;

/** Een nieuw id, vooraf te maken: zo kan een tijd uit de agenda op dit id geboekt worden vóór de aanvraag bestaat. */
export const nieuwAanvraagId = () => randomBytes(8).toString("hex");

/** Een aanvraag met een geboekte tijd (`afspraak`) begint op "Demo gepland", anders op "Nieuw". */
export async function maakAanvraag(nieuw: NieuweAanvraag, nu = new Date(), id = nieuwAanvraagId()): Promise<Aanvraag> {
  const moment = nu.toISOString();
  const aanvraag: Aanvraag = { ...nieuw, id, status: nieuw.afspraak ? STATUS_NA_BOEKEN : "nieuw", aangemaakt: moment, gewijzigd: moment };
  await kvSet(sleutel(id), aanvraag);
  return aanvraag;
}

/** Alle aanvragen, nieuwste eerst; verlopen aanvragen worden meteen gewist. */
export async function alleAanvragen(nu = new Date()): Promise<Aanvraag[]> {
  const rijen = await kvListEntries<Aanvraag>(PREFIX, 5000);
  const oud = rijen.filter((r) => aanvraagVerlopen(r.value.gewijzigd, nu));
  await Promise.all(oud.map((r) => kvDelete(r.key).catch(() => undefined)));
  return rijen
    .filter((r) => !aanvraagVerlopen(r.value.gewijzigd, nu))
    .map((r) => r.value)
    .sort((a, b) => (a.aangemaakt < b.aangemaakt ? 1 : -1));
}

async function haal(id: string): Promise<Aanvraag> {
  const a = isAanvraagId(id) ? await kvGet<Aanvraag>(sleutel(id)) : null;
  if (!a) throw AppError.notFound("Deze aanvraag bestaat niet (meer).");
  return a;
}

/** Status en/of notitie wijzigen; onthoudt wie het deed. Een lege notitie haalt hem weg. */
export async function wijzigAanvraag(id: string, w: { status?: Status | undefined; notitie?: string | undefined }, door: string, nu = new Date()): Promise<Aanvraag> {
  const a = await haal(id);
  const { notitie: oudeNotitie, ...rest } = a;
  const notitie = w.notitie === undefined ? oudeNotitie : w.notitie.trim().slice(0, NOTITIE_MAX);
  const bij: Aanvraag = { ...rest, ...(w.status ? { status: w.status } : {}), ...(notitie ? { notitie } : {}), behandeldDoor: door, gewijzigd: nu.toISOString() };
  await kvSet(sleutel(id), bij);
  return bij;
}

/** Een notitie erbij, met de naam van wie hem schreef en het moment. De regels staan in metNotitie. */
export async function voegNotitieToe(id: string, tekst: string, door: string, nu = new Date()): Promise<Aanvraag> {
  const a = await haal(id);
  const uitkomst = metNotitie(a.notities ?? [], { id: randomBytes(6).toString("hex"), tekst, door, op: nu.toISOString() });
  if (!uitkomst.ok) throw AppError.validation(uitkomst.fout, { veld: "notitie" });
  const bij: Aanvraag = { ...a, notities: uitkomst.waarde, behandeldDoor: door, gewijzigd: nu.toISOString() };
  await kvSet(sleutel(id), bij);
  return bij;
}

export async function verwijderNotitie(id: string, notitieId: string, door: string, nu = new Date()): Promise<Aanvraag> {
  const a = await haal(id);
  const { notities = [], ...rest } = a;
  if (!isNotitieId(notitieId) || !notities.some((n) => n.id === notitieId)) throw AppError.notFound("Deze notitie bestaat niet (meer).");
  const over = notities.filter((n) => n.id !== notitieId);
  const bij: Aanvraag = { ...rest, ...(over.length ? { notities: over } : {}), behandeldDoor: door, gewijzigd: nu.toISOString() };
  await kvSet(sleutel(id), bij);
  return bij;
}

/**
 * Past een aanvraag aan met `maak` (voor de agenda: de afspraak eraf bij annuleren). Bestaat de aanvraag niet
 * meer, dan is dat null en gebeurt er niets: de agenda mag daar niet op stuklopen.
 */
export async function bewerkAanvraag(id: string, maak: (a: Aanvraag) => Aanvraag, door: string, nu = new Date()): Promise<Aanvraag | null> {
  const a = isAanvraagId(id) ? await kvGet<Aanvraag>(sleutel(id)) : null;
  if (!a) return null;
  const bij: Aanvraag = { ...maak(a), id: a.id, aangemaakt: a.aangemaakt, behandeldDoor: door, gewijzigd: nu.toISOString() };
  await kvSet(sleutel(id), bij);
  return bij;
}

/** Verwijdert de aanvraag en geeft hem terug: wie een tijd had geboekt, krijgt die tijd in de route weer vrij. */
export async function verwijderAanvraag(id: string): Promise<Aanvraag> {
  const a = await haal(id);
  await kvDelete(sleutel(id));
  return a;
}
