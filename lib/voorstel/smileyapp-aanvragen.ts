import { randomBytes } from "crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { NOTITIE_MAX, aanvraagVerlopen, isAanvraagId, type Aanvraag, type NieuweAanvraag, type Status } from "@/lib/voorstel/smileyapp-aanvraag-regels";

// ---------------------------------------------------------------------------
// Opslag van demo-aanvragen en partner-aanmeldingen van het SmileyApp-voorstel.
// KV: voorstel-smileyapp:aanvraag:<id>. Ze gaan alleen naar het eigen beheer;
// er gaat niets naar derden. Een aanvraag vervalt twaalf maanden na de laatste
// wijziging: dat ruimt het lezen van de lijst op.
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-smileyapp:aanvraag:";
const sleutel = (id: string) => `${PREFIX}${id}`;

export async function maakAanvraag(nieuw: NieuweAanvraag, nu = new Date()): Promise<Aanvraag> {
  const id = randomBytes(8).toString("hex");
  const moment = nu.toISOString();
  const aanvraag: Aanvraag = { ...nieuw, id, status: "nieuw", aangemaakt: moment, gewijzigd: moment };
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

export async function verwijderAanvraag(id: string): Promise<void> {
  await haal(id);
  await kvDelete(sleutel(id));
}
