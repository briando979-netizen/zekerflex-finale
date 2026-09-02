"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { applyToShift } from "@/lib/matching/apply";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createCounterOffer } from "@/lib/offers/store";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";

const moneyExact = (c: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

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
    return {
      ok: true,
      message: res.shiftFilled ? "Aangenomen — de dienst is nu vol." : "Aangenomen! Je vindt hem bij Mijn klussen.",
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

    let taken = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await applyToShift(principal.userId, id);
        taken += 1;
      } catch (e) {
        failed.push(e instanceof AppError ? e.message : "onbekende fout");
      }
    }
    bust();
    if (taken === 0) return { ok: false, message: failed[0] ?? "Aanmelden mislukt." };
    return {
      ok: true,
      message:
        failed.length === 0
          ? `Aangenomen voor ${taken} ${taken === 1 ? "dag" : "dagen"}.`
          : `Aangenomen voor ${taken} ${taken === 1 ? "dag" : "dagen"} — ${failed.length} dag(en) lukten niet.`,
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

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: {
        title: true,
        hourlyRateCents: true,
        status: true,
        startsAt: true,
        branch: { select: { name: true } },
      },
    });
    if (!shift) return { ok: false, message: "Deze dienst bestaat niet meer." };
    if (!["OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(shift.status)) {
      return { ok: false, message: "Deze dienst neemt geen biedingen meer aan." };
    }
    if (shift.startsAt.getTime() < Date.now()) {
      return { ok: false, message: "Deze dienst is al begonnen." };
    }

    await createCounterOffer({
      userId: principal.userId,
      freelancerName: principal.fullName,
      shiftId,
      shiftTitle: shift.title,
      branch: shift.branch.name,
      listedRateCents: shift.hourlyRateCents,
      proposedRateCents,
      note: note.slice(0, 500),
    });

    await sendMail({
      to: env.MAIL_ADMIN,
      subject: `Tegenbod: ${shift.title} (${shift.branch.name})`,
      kind: "counter-offer",
      text: `${principal.fullName} biedt ${moneyExact(proposedRateCents)}/u voor "${shift.title}" bij ${shift.branch.name} (aangeboden: ${moneyExact(shift.hourlyRateCents)}/u).\n\n${note || "(geen toelichting)"}`,
    }).catch(() => undefined);

    bust();
    return { ok: true, message: `Tegenbod van ${moneyExact(proposedRateCents)}/u verstuurd. Je ziet 'm terug bij Mijn klussen.` };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Tegenbod versturen mislukt." };
  }
}
