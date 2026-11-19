import { randomBytes } from "crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { REVIEWS_MAX, isReview, isReviewId, reviewOverzicht, valideerReview, type Review, type ReviewInvoer, type ReviewOverzicht } from "@/lib/voorstel/smileyapp-review-regels";

// ---------------------------------------------------------------------------
// Opslag van de reviews die het SmileyApp-team zelf invoert. KV:
// voorstel-smileyapp:review:<id>. Per review: de naam zoals de schrijver hem
// zelf openbaar gebruikte, de tekst, de bron en de naam van het teamlid dat hem
// het laatst bewaarde. De site leest reviewsVoorSite(): lukt het lezen niet of
// is er geen zichtbare review, dan is dat null en bestaat het blok niet.
// ---------------------------------------------------------------------------

const PREFIX = "voorstel-smileyapp:review:";
const sleutel = (id: string) => `${PREFIX}${id}`;

/** Alle reviews (ook de verborgen), laatst ingevoerd eerst: voor het beheer. Een kapotte rij telt niet mee. */
export async function alleReviews(): Promise<Review[]> {
  return (await kvListValues<unknown>(PREFIX, 200)).filter(isReview).sort((a, b) => (a.aangemaakt < b.aangemaakt ? 1 : -1));
}

/** Wat de site toont: gemiddelde, aantal en hooguit zes kaarten; null zonder zichtbare review. */
export async function reviewsVoorSite(): Promise<ReviewOverzicht | null> {
  return reviewOverzicht(await alleReviews().catch(() => []));
}

/** Maakt een nieuwe review (zonder id) of wijzigt een bestaande. */
export async function bewaarReview(id: string | undefined, invoer: ReviewInvoer, door: string, nu = new Date()): Promise<Review> {
  const controle = valideerReview(invoer, amsterdamDayKey(nu));
  if (!controle.ok) throw AppError.validation(controle.fout, { veld: controle.veld });
  if (id !== undefined) {
    const oud = isReviewId(id) ? await kvGet<unknown>(sleutel(id)) : null;
    if (!isReview(oud)) throw AppError.notFound("Deze review bestaat niet (meer).");
    // opnieuw opgebouwd, niet over de oude heen gelegd: een veld dat is leeggemaakt verdwijnt zo ook uit de opslag
    const bij: Review = { id: oud.id, ...controle.waarde, aangemaakt: oud.aangemaakt, door };
    await kvSet(sleutel(id), bij);
    return bij;
  }
  if ((await alleReviews()).length >= REVIEWS_MAX) throw AppError.validation(`Er staan al ${REVIEWS_MAX} reviews. Verwijder eerst een oude review.`);
  const nieuw: Review = { id: randomBytes(8).toString("hex"), ...controle.waarde, aangemaakt: nu.toISOString(), door };
  await kvSet(sleutel(nieuw.id), nieuw);
  return nieuw;
}

export async function verwijderReview(id: string): Promise<void> {
  const r = isReviewId(id) ? await kvGet<unknown>(sleutel(id)) : null;
  if (!r) throw AppError.notFound("Deze review bestaat niet (meer).");
  await kvDelete(sleutel(id));
}
