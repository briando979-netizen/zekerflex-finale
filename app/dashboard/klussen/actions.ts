"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { applyToShift } from "@/lib/matching/apply";
import { REACTIE_KLAAR_TEKST } from "@/lib/matching/reactie";
import { payoutEligibility } from "@/lib/fiscal/eligibility";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createCounterOffer } from "@/lib/offers/store";
import { klusToegang } from "@/lib/admin/eigen-test-zicht";
import { probeerVasteSchil } from "@/lib/pools/vaste-schil";
import { findOverlappingShift, overlapMessageSelf } from "@/lib/shifts/worker-overlap";
import { pushShiftTaken } from "@/lib/notifications/employer-push";
import { runAfter } from "@/lib/run-after";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { isUitzendPartnerTenant } from "@/lib/uitzend/partners";
import { meldUitzendcontractAanvraag } from "@/lib/uitzend/aanvraag";

const moneyExact = (c: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

/** How long after a shift's real start time a late reaction/acceptance is still allowed (e.g. a no-show backfill). */
const LATE_REACTION_GRACE_MS = 2 * 60 * 60 * 1000;

export interface ApplyResult {
  ok: boolean;
  message: string;
}

function bust() {
  revalidatePath("/dashboard/klussen");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/diensten");
}

export async function applyToShiftAction(shiftId: string): Promise<ApplyResult> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const res = await applyToShift(principal.userId, shiftId);
    bust();
    if (!res.pendingCompanyVerification) runAfter(() => pushShiftTaken(shiftId, principal.fullName));
    return {
      ok: true,
      // een bedrijf dat nog niet is gecontroleerd: de reactie staat vastgelegd bij het bedrijf (lib/matching/reactie.ts)
      message: res.pendingCompanyVerification
        ? REACTIE_KLAAR_TEKST
        : res.shiftFilled
          ? "Aangenomen — de dienst is nu vol."
          : "Aangenomen! Je vindt hem bij Mijn klussen.",
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Aannemen mislukt. Probeer het opnieuw." };
  }
}

/** Apply to several days of a multi-day series at once. Best-effort per day. */
export async function applyToSeriesAction(shiftIds: string[]): Promise<ApplyResult> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const ids = [...new Set(shiftIds)].slice(0, 21);
    if (ids.length === 0) return { ok: false, message: "Kies minstens één dag." };

    // ingepland: echt aangenomen. klaar: het bedrijf is nog niet gecontroleerd; de reactie staat vastgelegd en wacht op het bedrijf
    let taken = 0;
    let klaar = 0;
    let firstTaken: string | null = null;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        const res = await applyToShift(principal.userId, id);
        if (res.pendingCompanyVerification) {
          klaar += 1;
        } else {
          taken += 1;
          firstTaken ??= id;
        }
      } catch (e) {
        failed.push(e instanceof AppError ? e.message : "onbekende fout");
      }
    }
    bust();
    // One message for the whole series, not one per day.
    if (firstTaken) {
      const id = firstTaken;
      runAfter(() => pushShiftTaken(id, principal.fullName, taken));
    }
    if (taken + klaar === 0) return { ok: false, message: failed[0] ?? "Aanmelden mislukt." };
    const dagen = (n: number) => `${n} ${n === 1 ? "dag" : "dagen"}`;
    const mislukt = failed.length === 0 ? "" : ` ${failed.length} dag(en) lukten niet.`;
    return {
      ok: true,
      message:
        klaar === 0
          ? failed.length === 0
            ? `Aangenomen voor ${dagen(taken)}.`
            : `Aangenomen voor ${dagen(taken)} — ${failed.length} dag(en) lukten niet.`
          : taken === 0
            ? `${REACTIE_KLAAR_TEKST}${mislukt}`
            : `Aangenomen voor ${dagen(taken)}. Voor ${dagen(klaar)} staat je reactie klaar; het bedrijf ziet hem en bevestigt.${mislukt}`,
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Aanmelden mislukt." };
  }
}

/** Propose a different rate before accepting. Filesystem only, never touches the DB. */
export async function counterOfferAction(
  shiftId: string,
  proposedRateCents: number,
  note: string,
): Promise<ApplyResult> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    if (!Number.isFinite(proposedRateCents) || proposedRateCents < 1000 || proposedRateCents > 25000) {
      return { ok: false, message: "Voer een tarief tussen € 10 en € 250 per uur in." };
    }

    const eligible = await payoutEligibility(principal.userId);

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        title: true,
        hourlyRateCents: true,
        status: true,
        startsAt: true,
        endsAt: true,
        viaUitzendbureau: true,
        branch: { select: { name: true, tenantId: true, tenant: { select: { name: true } } } },
      },
    });
    if (!shift) return { ok: false, message: "Deze dienst bestaat niet meer." };
    // privé-accounts van de eigenaar (lib/admin/eigen-test-regel.ts): dezelfde antwoorden als applyToShift
    const toegang = await klusToegang(principal.userId, shift.branch.tenantId);
    if (!toegang.zien) return { ok: false, message: "Deze dienst bestaat niet meer." };
    if (!toegang.reageren) return { ok: false, message: "Deze dienst is nog niet open voor aanmeldingen." };
    // Klus van een uitzendpartner (lib/uitzend/partners-kern.ts): het bureau is de werkgever. De eisen van ZekerFlex
    // (KVK/IBAN, of BSN en de ZekerFlex-uitzendovereenkomst) gelden dan niet, en de reactie is een aanvraag voor een
    // uitzendcontract tegen het vaste uurloon.
    const partnerKlus = await isUitzendPartnerTenant(shift.branch.tenantId);
    if (!partnerKlus && !eligible.ok) {
      return { ok: false, message: eligible.reason ?? "Je kunt nog niet op klussen reageren." };
    }
    // Uitzendkrachten work for the listed wage (CAO) — no counter-offers.
    if (eligible.track === "payroll" || partnerKlus) proposedRateCents = shift.hourlyRateCents;
    if (shift.viaUitzendbureau && !partnerKlus && eligible.track !== "payroll") {
      return { ok: false, message: "Deze klus loopt via een uitzendbureau; reageren kan alleen als uitzendkracht." };
    }
    if (!["OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(shift.status)) {
      return { ok: false, message: "Deze dienst neemt geen biedingen meer aan." };
    }
    if (shift.startsAt.getTime() + LATE_REACTION_GRACE_MS < Date.now()) {
      return { ok: false, message: "Deze dienst is al meer dan 2 uur geleden begonnen — reageren kan niet meer." };
    }
    // Wie op dat moment al werkt, kan niet worden uitgekozen: zeg dat nu, niet pas als de werkgever akkoord geeft.
    const me = await prisma.freelancerProfile.findUnique({ where: { userId: principal.userId }, select: { id: true } });
    const overlap = me
      ? await findOverlappingShift(prisma, me.id, { shiftId, startsAt: shift.startsAt, endsAt: shift.endsAt })
      : null;
    if (overlap) return { ok: false, message: overlapMessageSelf(overlap) };

    const offer = await createCounterOffer({
      userId: principal.userId,
      freelancerName: principal.fullName,
      shiftId,
      shiftTitle: shift.title,
      branch: shift.branch.name,
      listedRateCents: shift.hourlyRateCents,
      proposedRateCents,
      note: note.slice(0, 500),
    });

    // uitzendpartner: de werker gaf bij de knop toestemming; het bureau krijgt zijn contactgegevens (lib/uitzend/aanvraag.ts)
    if (partnerKlus) runAfter(() => meldUitzendcontractAanvraag({ workerUserId: principal.userId, shiftId }));

    // vaste schil (lib/pools/vaste-schil.ts): lid van een pool met "direct inplannen" en het geplaatste tarief → meteen ingepland
    const schil = await probeerVasteSchil(offer, shift.branch.tenantId).catch(() => ({ ingepland: false as const }));
    if (schil.ingepland) {
      bust();
      return { ok: true, message: `Je staat direct ingepland op "${shift.title}": je hoort bij de vaste schil van ${shift.branch.name}. Je vindt de klus bij Mijn klussen.` };
    }

    await sendMail({
      to: env.MAIL_ADMIN,
      subject: `Tegenbod: ${shift.title} (${shift.branch.name})`,
      kind: "counter-offer",
      text: `${principal.fullName} biedt ${moneyExact(proposedRateCents)}/u voor "${shift.title}" bij ${shift.branch.name} (aangeboden: ${moneyExact(shift.hourlyRateCents)}/u).\n\n${note || "(geen toelichting)"}`,
    }).catch(() => undefined);

    bust();
    if (partnerKlus) {
      return { ok: true, message: `Je aanvraag is verstuurd naar ${shift.branch.tenant.name}. Het uitzendbureau neemt contact met je op over het contract. Je ziet de klus terug bij Mijn klussen.` };
    }
    return { ok: true, message: `Tegenbod van ${moneyExact(proposedRateCents)}/u verstuurd. Je ziet 'm terug bij Mijn klussen.` };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Tegenbod versturen mislukt." };
  }
}
