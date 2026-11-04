import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { listCounterOffers, setOfferStatus } from "@/lib/offers/store";
import { cancelReplacementRequest, listReplacementRequests } from "@/lib/replacements/store";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { reactieVervalt, vervangingVervalt } from "@/lib/offers/verval";

// ---------------------------------------------------------------------------
// Opruimronde voor dingen die anders voor altijd "openstaan":
//   • een reactie op een klus waar de opdrachtgever niet op koos, terwijl de klus
//     al begon (of geannuleerd/weg is) → "expired" (niet uitgekozen) + één push
//     "helaas niet uitgekozen, zoek een andere klus". In "Mijn klussen" staat hij
//     dan in het archief, met "Zoek een andere klus" en "Klus verbergen".
//   • een open vervangingsverzoek voor een klus die al begon → gesloten, zodat
//     hij niet meer aan anderen wordt aangeboden en de klus gewoon naar de uren gaat.
// Draait mee met de werker-pushronde (lib/notifications/worker-push.ts: elke paar
// minuten via de meldingen-poll en dagelijks via de cron). Idempotent.
// ---------------------------------------------------------------------------

/** Alleen een seintje voor klussen die kort geleden begonnen; oude achterstand wordt stil opgeruimd. */
const SEINTJE_TOT_MS = 48 * 60 * 60 * 1000;

export interface OpruimUitslag {
  reacties: number;
  seintjes: number;
  vervangingen: number;
}

async function eenmalig(sleutel: string): Promise<boolean> {
  if (await kvGet(sleutel)) return false;
  await kvSet(sleutel, { at: new Date().toISOString() });
  return true;
}

export async function ruimVerlopenReactiesOp(now = new Date()): Promise<OpruimUitslag> {
  const uit: OpruimUitslag = { reacties: 0, seintjes: 0, vervangingen: 0 };

  // ── reacties zonder keuze ───────────────────────────────────────────
  // Ook "expired" doet mee: kreeg de werker de klus toch (via een andere weg, bv.
  // direct ingepland), dan is de reactie gewoon geaccepteerd en geen "niet uitgekozen".
  const open = (await listCounterOffers(5000)).filter((o) => o.status === "pending" || o.status === "expired");
  if (open.length) {
    const shiftIds = [...new Set(open.map((o) => o.shiftId))];
    const [shifts, toegewezen] = await Promise.all([
      prisma.shift.findMany({ where: { id: { in: shiftIds } }, select: { id: true, title: true, startsAt: true, status: true } }),
      prisma.shiftAssignment.findMany({ where: { shiftId: { in: shiftIds }, cancelledAt: null }, select: { shiftId: true, freelancer: { select: { userId: true } } } }),
    ]);
    const perId = new Map(shifts.map((s) => [s.id, s]));
    const kreegHem = new Set(toegewezen.map((a) => `${a.freelancer.userId}:${a.shiftId}`));
    for (const o of open) {
      if (kreegHem.has(`${o.userId}:${o.shiftId}`)) {
        // stil: geen nieuw antwoordmoment, dus ook geen melding achteraf
        await setOfferStatus(o.id, "accepted", { stil: true });
        continue;
      }
      if (o.status !== "pending") continue;
      const shift = perId.get(o.shiftId);
      const reden = reactieVervalt(shift, now);
      if (!reden) continue;
      await setOfferStatus(o.id, "expired");
      uit.reacties += 1;
      // geannuleerde klussen krijgen al hun eigen bericht; een verdwenen klus heeft geen titel meer
      if (reden !== "begonnen" || !shift || now.getTime() - shift.startsAt.getTime() > SEINTJE_TOT_MS) continue;
      if (!(await eenmalig(`push-sent:notchosen:${o.id}`))) continue;
      await sendLocalizedPush([o.userId], (t) => ({
        title: t.notChosenTitle,
        body: t.notChosenBody(shift.title),
        data: { type: "SHIFT", url: "/dashboard/klussen", tag: `notchosen-${o.shiftId}` },
        ttlSeconds: 24 * 3600,
      })).catch(() => 0);
      uit.seintjes += 1;
    }
  }

  // ── vervangingsverzoeken voor klussen die al begonnen ───────────────
  const verzoeken = (await listReplacementRequests(1000)).filter((r) => r.status === "open" && vervangingVervalt(r.startsAt, now));
  for (const r of verzoeken) {
    await cancelReplacementRequest(r.id);
    uit.vervangingen += 1;
  }
  return uit;
}
