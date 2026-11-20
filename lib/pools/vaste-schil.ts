import { applyToShift } from "@/lib/matching/apply";
import { setOfferStatus, type CounterOffer } from "@/lib/offers/store";
import { vasteSchilPoolVoor } from "@/lib/pools/store";
import { recordAudit } from "@/lib/audit";
import { resolveShiftContact } from "@/lib/messaging/contacts";
import { ensureDirectThread, postMessage } from "@/lib/messaging/store";
import { sendUserPush } from "@/lib/notifications/push";
import { maybeSweepWorkerPushes } from "@/lib/notifications/worker-push";
import { runAfter } from "@/lib/run-after";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Vaste schil (20 nov 2026, naar Temper's flexpools met auto-accept): een bedrijf zet op een pool "direct inplannen"
// aan. Reageert een lid van die pool op een klus van dat bedrijf tegen het geplaatste tarief, dan staat het meteen
// ingepland: dezelfde weg als wanneer het bedrijf de reactie zelf accepteert (applyToShift → recordOfferResponse,
// met alle controles: verificatie, vol, overlap, geblokkeerd). Een tegenbod met een ander tarief gaat nooit vanzelf.
// ---------------------------------------------------------------------------

export interface VasteSchilUitkomst {
  /** direct ingepland via deze pool */
  ingepland: boolean;
  poolNaam?: string;
}

export async function probeerVasteSchil(
  offer: Pick<CounterOffer, "id" | "userId" | "freelancerName" | "shiftId" | "shiftTitle" | "proposedRateCents" | "listedRateCents">,
  tenantId: string,
): Promise<VasteSchilUitkomst> {
  if (offer.proposedRateCents !== offer.listedRateCents) return { ingepland: false };
  const pool = await vasteSchilPoolVoor(tenantId, offer.userId).catch(() => null);
  if (!pool) return { ingepland: false };

  let uitkomst;
  try {
    uitkomst = await applyToShift(offer.userId, offer.shiftId);
  } catch (err) {
    // vol, overlap, geblokkeerd, niet geverifieerd: dan blijft het een gewone reactie die het bedrijf zelf beoordeelt
    logger.info("vaste schil: niet direct ingepland", { shiftId: offer.shiftId, poolId: pool.id, reden: err instanceof Error ? err.message : String(err) });
    return { ingepland: false };
  }
  if (uitkomst.pendingCompanyVerification) return { ingepland: false };

  await setOfferStatus(offer.id, "accepted");
  await recordAudit({
    category: "MATCHING",
    action: "offer.auto_accepted",
    actorLabel: "system",
    summary: `${offer.freelancerName} direct ingepland op "${offer.shiftTitle}" via vaste schil "${pool.name}"`,
    targetType: "shift",
    targetId: offer.shiftId,
    metadata: { poolId: pool.id, offerId: offer.id },
  }).catch(() => undefined);

  // de werker hoort het in de chat en via de "uitgekozen"-push; het bedrijf krijgt één push
  const contact = await resolveShiftContact(offer.shiftId).catch(() => null);
  if (contact) {
    try {
      const thread = await ensureDirectThread(contact.userId, offer.userId, {
        contextKey: `shift:${offer.shiftId}`,
        shiftId: offer.shiftId,
        shiftTitle: offer.shiftTitle,
        subject: offer.shiftTitle,
      });
      await postMessage(thread.id, "system", `Je staat direct ingepland op "${offer.shiftTitle}": je hoort bij de vaste schil van dit bedrijf.`, "system");
    } catch {
      /* niet fataal */
    }
    runAfter(() =>
      sendUserPush([contact.userId], {
        title: `Direct ingepland: ${offer.shiftTitle}`,
        body: `${offer.freelancerName} uit je vaste schil "${pool.name}" heeft gereageerd en staat ingepland.`,
        data: { type: "SHIFT", url: `/werkgever/diensten/${offer.shiftId}`, tag: `vaste-schil-${offer.id}` },
        ttlSeconds: 43_200,
      }),
    );
  }
  runAfter(() => maybeSweepWorkerPushes());
  return { ingepland: true, poolNaam: pool.name };
}
