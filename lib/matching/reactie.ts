import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { createCounterOffer, myOfferForShift, setOfferStatus } from "@/lib/offers/store";

// ---------------------------------------------------------------------------
// Een reactie van een werker gaat nooit verloren (23 nov 2026, eigenaar: iedereen mag klussen plaatsen, de controle van het bedrijf
// komt pas bij het inplannen). Reageert een werker op een klus van een bedrijf dat nog niet is gecontroleerd, dan wacht alleen het
// inplannen zelf (de ShiftAssignment, op de serverpoort in lib/company/verified.ts); de reactie wordt vastgelegd als een gewone
// reactie. Dat geldt op elke weg waarlangs een werker kan reageren:
//   - de app: reageren met een tarief of opmerking (counterOfferAction) maakt zelf al een reactie,
//   - de knop "Aannemen" (applyToShift), een antwoord op een spoedoproep en een vaste-schil-reactie (via applyToShift),
//   - het antwoord op een aanbod uit een pushbericht (recordOfferResponse, via api/shifts/[shiftId]/offer).
// "Vastgelegd" betekent twee dingen: de shiftMatch staat op VIEWED (geïnteresseerd, geen verloopmoment) en er staat een reactie bij
// het bedrijf onder "Heeft gereageerd", die het bedrijf zelf kan accepteren zodra het is gecontroleerd.
// ---------------------------------------------------------------------------

/** Wat de werker leest als zijn reactie klaarstaat omdat het bedrijf nog niet is gecontroleerd (de eerlijke tekst, voor elke weg). */
export const REACTIE_KLAAR_TEKST = "Je reactie staat klaar; het bedrijf ziet hem en bevestigt.";

/**
 * Leg de reactie van deze werker op deze klus vast als reactie bij het bedrijf, tegen het geplaatste tarief. Een reactie die er al
 * staat (met een eigen tarief of opmerking) blijft zoals ze is: die vervangen we nooit. Faalt het wegschrijven, dan gaat de
 * reactie niet verloren: de VIEWED-markering op de shiftMatch staat er dan al (de aanroeper zet hem eerst). Geeft terug of er een
 * nieuwe reactie is gemaakt.
 */
export async function leggReactieVast(userId: string, shiftId: string): Promise<boolean> {
  try {
    const bestaand = await myOfferForShift(userId, shiftId);
    if (bestaand?.status === "pending") return false;
    const [shift, user] = await Promise.all([
      prisma.shift.findUnique({ where: { id: shiftId }, select: { title: true, hourlyRateCents: true, branch: { select: { name: true } } } }),
      prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
    ]);
    if (!shift || !user) return false;
    await createCounterOffer({
      userId,
      freelancerName: user.fullName,
      shiftId,
      shiftTitle: shift.title,
      branch: shift.branch.name,
      listedRateCents: shift.hourlyRateCents,
      proposedRateCents: shift.hourlyRateCents,
      note: "",
    });
    return true;
  } catch (err) {
    logger.warn("reactie vastleggen: reactie bij het bedrijf niet gemaakt", { shiftId, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/**
 * De werker staat nu echt ingepland: een reactie van hem die nog openstond is daarmee afgehandeld (stil: geen melding). Zo ziet het
 * bedrijf geen reactie van iemand die al op de klus staat, ook niet als hij na de goedkeuring van het bedrijf zelf "Aannemen" tikte.
 */
export async function sluitEigenReactie(userId: string, shiftId: string): Promise<void> {
  try {
    const reactie = await myOfferForShift(userId, shiftId);
    if (reactie?.status === "pending") await setOfferStatus(reactie.id, "accepted", { stil: true });
  } catch {
    // een storing hier mag het inplannen nooit terugdraaien
  }
}
