"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { listCounterOffers, setOfferStatus } from "@/lib/offers/store";
import { ensureDirectThread, postMessage } from "@/lib/messaging/store";
import { recordAudit } from "@/lib/audit";

export interface OfferResponse {
  ok: boolean;
  message: string;
}

async function assertOwnsShift(shiftId: string) {
  const principal = await requirePrincipal();
  requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
  const scope = await resolveEmployerScope(principal);
  const scopeWhere = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
  const shift = await prisma.shift.findFirst({
    where: { AND: [{ id: shiftId }, { branch: scopeWhere }] },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      hourlyRateCents: true,
      positions: true,
      branch: { select: { name: true } },
      assignments: {
        where: { cancelledAt: null },
        select: { id: true, freelancer: { select: { userId: true, user: { select: { fullName: true } } } } },
      },
    },
  });
  if (!shift) throw AppError.forbidden("Je hebt geen toegang tot deze dienst.");
  return { principal, shift };
}

const updateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  breakMinutes: z.number().int().min(0).max(240).optional(),
  hourlyRateCents: z.number().int().min(500).max(50000).optional(),
  positions: z.number().int().min(1).max(50).optional(),
});

/** Employer edits an open dienst. Locked once it is filled / in progress. */
export async function updateShiftAction(
  shiftId: string,
  input: z.infer<typeof updateSchema>,
): Promise<OfferResponse> {
  try {
    const p = await requirePrincipal();
    const { shift } = await assertOwnsShift(shiftId);
    const parsed = updateSchema.parse(input);

    if (!["DRAFT", "OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(shift.status)) {
      return { ok: false, message: "Deze dienst kan niet meer worden aangepast (al bezet of gestart)." };
    }
    const starts = parsed.startsAt ? new Date(parsed.startsAt) : shift.startsAt;
    const ends = parsed.endsAt ? new Date(parsed.endsAt) : shift.endsAt;
    if (ends <= starts) return { ok: false, message: "Einde moet na de start liggen." };
    if (parsed.positions !== undefined && parsed.positions < shift.assignments.length) {
      return { ok: false, message: `Er zijn al ${shift.assignments.length} krachten aangenomen.` };
    }

    await prisma.shift.update({
      where: { id: shift.id },
      data: {
        ...(parsed.title ? { title: parsed.title } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description || null } : {}),
        ...(parsed.startsAt ? { startsAt: starts } : {}),
        ...(parsed.endsAt ? { endsAt: ends } : {}),
        ...(parsed.breakMinutes !== undefined ? { breakMinutes: parsed.breakMinutes } : {}),
        ...(parsed.hourlyRateCents !== undefined ? { hourlyRateCents: parsed.hourlyRateCents } : {}),
        ...(parsed.positions !== undefined ? { positions: parsed.positions } : {}),
      },
    });

    await recordAudit({
      category: "MATCHING",
      action: "shift.updated",
      actorUserId: p.userId,
      actorLabel: "user",
      summary: `Dienst "${shift.title}" aangepast door opdrachtgever`,
      targetType: "shift",
      targetId: shift.id,
    });

    // notify already-assigned people
    for (const a of shift.assignments) {
      try {
        const t = await ensureDirectThread(p.userId, a.freelancer.userId, {
          contextKey: `shift:${shift.id}`,
          shiftId: shift.id,
          shiftTitle: parsed.title ?? shift.title,
        });
        await postMessage(t.id, "system", "De opdrachtgever heeft de details van deze dienst aangepast. Bekijk de klus opnieuw.", "system");
      } catch {
        /* non-fatal */
      }
    }

    revalidatePath(`/werkgever/diensten/${shift.id}`);
    revalidatePath("/werkgever/diensten");
    return { ok: true, message: "Dienst bijgewerkt." };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Aanpassen mislukt." };
  }
}

/** Employer cancels a dienst. If someone was assigned, they may file a 50% claim. */
export async function cancelShiftAction(shiftId: string, reason: string): Promise<OfferResponse> {
  try {
    const p = await requirePrincipal();
    const { shift } = await assertOwnsShift(shiftId);
    if (["COMPLETED", "CANCELLED"].includes(shift.status)) {
      return { ok: false, message: "Deze dienst is al afgerond of geannuleerd." };
    }

    const hours = Math.max(0, (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000 - shift.breakMinutes / 60);
    const seatValueCents = Math.round(hours * shift.hourlyRateCents);
    const hadAssignees = shift.assignments.length > 0;

    await prisma.$transaction([
      prisma.shift.update({ where: { id: shift.id }, data: { status: "CANCELLED" } }),
      ...shift.assignments.map((a) =>
        prisma.shiftAssignment.update({
          where: { id: a.id },
          data: { cancelledAt: new Date(), cancelReason: `Geannuleerd door opdrachtgever: ${reason.slice(0, 200)}` },
        }),
      ),
    ]);

    await recordAudit({
      category: "MATCHING",
      action: "shift.cancelled_by_employer",
      actorUserId: p.userId,
      actorLabel: "user",
      summary: `Dienst "${shift.title}" geannuleerd door opdrachtgever (${shift.assignments.length} toegewezen)`,
      targetType: "shift",
      targetId: shift.id,
      metadata: { reason, seatValueCents },
    });

    for (const a of shift.assignments) {
      try {
        const t = await ensureDirectThread(p.userId, a.freelancer.userId, {
          contextKey: `shift:${shift.id}`,
          shiftId: shift.id,
          shiftTitle: shift.title,
        });
        await postMessage(
          t.id,
          "system",
          `Deze dienst is geannuleerd door de opdrachtgever. Reden: ${reason}. ` +
            `Je kunt een vergoeding claimen van 50% (${new Intl.NumberFormat("nl-NL", {
              style: "currency",
              currency: "EUR",
            }).format(Math.round(seatValueCents * 0.5) / 100)}) via je diensten-overzicht.`,
          "system",
        );
      } catch {
        /* non-fatal */
      }
    }

    revalidatePath(`/werkgever/diensten/${shift.id}`);
    revalidatePath("/werkgever/diensten");
    return {
      ok: true,
      message: hadAssignees
        ? "Dienst geannuleerd. De toegewezen kracht(en) zijn geïnformeerd en kunnen 50% claimen."
        : "Dienst geannuleerd.",
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Annuleren mislukt." };
  }
}

const eur = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

/** Employer accepts or declines a freelancer's counter-offer. */
export async function respondToOfferAction(
  offerId: string,
  decision: "accepted" | "declined",
): Promise<OfferResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");

    const offer = (await listCounterOffers(500)).find((o) => o.id === offerId);
    if (!offer) return { ok: false, message: "Tegenbod niet gevonden." };
    if (offer.status !== "pending") return { ok: false, message: "Dit tegenbod is al afgehandeld." };

    // verify the employer owns the shift
    const scope = await resolveEmployerScope(principal);
    const scopeWhere = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
    const shift = await prisma.shift.findFirst({
      where: { AND: [{ id: offer.shiftId }, { branch: scopeWhere }] },
      select: { id: true, title: true, hourlyRateCents: true, status: true },
    });
    if (!shift) throw AppError.forbidden("Je hebt geen toegang tot deze dienst.");

    await setOfferStatus(offerId, decision);

    if (decision === "accepted") {
      // The shift now pays the agreed rate (employer's own shift).
      if (["OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(shift.status)) {
        await prisma.shift.update({
          where: { id: shift.id },
          data: { hourlyRateCents: offer.proposedRateCents },
        });
      }
      await recordAudit({
        category: "MATCHING",
        action: "offer.accepted",
        actorUserId: principal.userId,
        actorLabel: "user",
        summary: `Tegenbod ${eur(offer.proposedRateCents)}/u geaccepteerd voor "${shift.title}"`,
        targetType: "shift",
        targetId: shift.id,
      });
    }

    // let the freelancer know in chat
    try {
      const thread = await ensureDirectThread(principal.userId, offer.userId, {
        contextKey: `shift:${offer.shiftId}`,
        shiftId: offer.shiftId,
        shiftTitle: shift.title,
        subject: shift.title,
      });
      await postMessage(
        thread.id,
        "system",
        decision === "accepted"
          ? `Je tegenbod van ${eur(offer.proposedRateCents)}/u is geaccepteerd. Je kunt de klus nu aannemen tegen dit tarief.`
          : `Je tegenbod van ${eur(offer.proposedRateCents)}/u is helaas afgewezen. Het oorspronkelijke tarief van ${eur(offer.listedRateCents)}/u blijft gelden.`,
        "system",
      );
    } catch {
      /* non-fatal */
    }

    revalidatePath(`/werkgever/diensten/${offer.shiftId}`);
    revalidatePath("/werkgever/diensten");
    return {
      ok: true,
      message: decision === "accepted" ? "Tegenbod geaccepteerd — de kracht kan nu aannemen." : "Tegenbod afgewezen.",
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Actie mislukt." };
  }
}
