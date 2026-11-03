import { kvDelete, kvGet, kvListEntries } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { CONTACT } from "@/lib/voorstel/schwarzwald";
import { hoortBij, komendeReservering } from "@/lib/voorstel/privacy-regels";
import type { Boeking } from "@/lib/voorstel/schwarzwald-boekingen";
import type { Aanvraag, CrmItem, Klantkaart } from "@/lib/voorstel/schwarzwald-crm";
import type { GastReview } from "@/lib/voorstel/schwarzwald-reviews";
import type { Sollicitatie } from "@/lib/voorstel/schwarzwald-sollicitaties";

// ---------------------------------------------------------------------------
// Inzage en verwijdering (AVG) voor gasten: alles wat onder hun e-mailadres
// staat, verspreid over de KV-prefixen van deze site. Een nieuw soort
// gastgegevens hoort hier ook bij te komen.
// ---------------------------------------------------------------------------

const P = "voorstel-schwarzwald:";
const norm = (email: string) => email.trim().toLowerCase();

async function rijenVan<T extends { email?: unknown; account?: unknown }>(prefix: string, email: string) {
  return (await kvListEntries<T>(`${P}${prefix}`, 5000)).filter((r) => hoortBij(r.value, email));
}

/** Alles wat de gast zelf ook in zijn account ziet, plus sollicitaties. */
export async function gegevensVan(email: string) {
  const e = norm(email);
  const [account, kaart, items, boekingen, aanvragen, reviews, sollicitaties] = await Promise.all([
    kvGet<{ hash?: string } & Record<string, unknown>>(`${P}account:${e}`),
    kvGet<Klantkaart>(`${P}klant:${e}`),
    kvListEntries<CrmItem>(`${P}crm:${e}:`, 5000),
    rijenVan<Boeking>("boeking:", e),
    rijenVan<Aanvraag>("aanvraag:", e),
    rijenVan<GastReview>("review:", e),
    rijenVan<Sollicitatie>("sollicitatie:", e),
  ]);
  const { hash: _hash, ...accountZonderHash } = account ?? {};
  return {
    uitgedraaid: new Date().toISOString(),
    account: account ? accountZonderHash : null,
    wensen: kaart?.wensen ?? "",
    berichten: items.map((r) => r.value).filter((i) => i.soort === "bericht-klant" || i.soort === "bericht-team").map(({ soort, tekst, door, datum }) => ({ soort, tekst, door, datum })),
    reserveringen: boekingen.map((r) => r.value),
    aanvragen: aanvragen.map((r) => r.value),
    beoordelingen: reviews.map((r) => r.value),
    sollicitaties: sollicitaties.map((r) => r.value),
  };
}

/**
 * Wist het account en alle gegevens onder dit e-mailadres. Een reservering
 * die nog komt houdt dat tegen: die moet eerst geannuleerd (of gebeld).
 */
export async function wisGast(email: string): Promise<Record<string, number>> {
  const e = norm(email);
  const boekingen = await rijenVan<Boeking>("boeking:", e);
  const komend = komendeReservering(
    boekingen.map((r) => r.value),
    amsterdamDayKey(new Date()),
  );
  if (komend) {
    const dag = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${komend.datum}T12:00:00Z`));
    throw AppError.validation(`Je hebt nog een reservering op ${dag}. Annuleer die eerst onder Reserveringen, of bel ons op ${CONTACT.telefoon}.`);
  }
  const [items, aanvragen, reviews, sollicitaties] = await Promise.all([
    kvListEntries<CrmItem>(`${P}crm:${e}:`, 5000),
    rijenVan<Aanvraag>("aanvraag:", e),
    rijenVan<GastReview>("review:", e),
    rijenVan<Sollicitatie>("sollicitatie:", e),
  ]);
  const sleutels = [
    `${P}account:${e}`,
    `${P}klant:${e}`,
    ...[boekingen, items, aanvragen, reviews, sollicitaties].flatMap((rijen) => rijen.map((r) => r.key)),
  ];
  await Promise.all(sleutels.map((k) => kvDelete(k)));
  return { reserveringen: boekingen.length, berichten: items.length, aanvragen: aanvragen.length, beoordelingen: reviews.length, sollicitaties: sollicitaties.length };
}
