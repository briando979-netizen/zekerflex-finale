"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { MIN_SHIFT_RATE_CENTS } from "@/lib/shifts/create";
import { listCounterOffers, setOfferStatus } from "@/lib/offers/store";
import { applyToShift } from "@/lib/matching/apply";
import { isWerkerNietKlaar } from "@/lib/fiscal/werker-niet-klaar";
import { getDict } from "@/lib/i18n/server";
import { nl as nlDict } from "@/lib/i18n/dictionaries";
import { ensureDirectThread, postMessage } from "@/lib/messaging/store";
import { recordAudit } from "@/lib/audit";
import { runMatchingForShift } from "@/lib/matching/engine";
import { statusNaHeropenen } from "@/lib/werkgever/heropenen-kern";
import { notifyFollowersOfShifts } from "@/lib/worker/follows";
import { notifyJobAlerts } from "@/lib/matching/job-alerts";
import { repeatWithSameTeam } from "@/lib/shifts/repeat";
import { runAfter } from "@/lib/run-after";
import { maybeSweepWorkerPushes, pushOfferDeclined } from "@/lib/notifications/worker-push";
import { userLocales } from "@/lib/i18n/worker-locale";
import { uitgekozenEmailT } from "@/lib/mail/werker/uitgekozen";
import { sendMail } from "@/lib/mail";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { pushWhen, pushDayMonth } from "@/lib/i18n/worker-push";
import { findOverlappingShift, overlapMessageOther, overlapWhen } from "@/lib/shifts/worker-overlap";
import { shiftLengthProblem } from "@/lib/shifts/shift-length";
import { parseAmsterdamLocal } from "@/lib/time/amsterdam";
import { haalVanReservebank, zetOpReservebank } from "@/lib/reservebank/store";
import { reservebankOpen, reservebankToegang } from "@/lib/reservebank/kern";
import { isTenantVerified } from "@/lib/company/verified";
import { BEDRIJF_NOG_NIET_GECONTROLEERD, NOG_NIET_GECONTROLEERD_TEKST, bedrijfMagDoen } from "@/lib/company/gecontroleerd";

export interface OfferResponse {
  ok: boolean;
  message: string;
  /** een herkenbare reden als de actie niet mag, bv. BEDRIJF_NOG_NIET_GECONTROLEERD: het scherm toont dan "Nog een paar laatste checks" */
  code?: string;
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
      visibility: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      hourlyRateCents: true,
      positions: true,
      viaUitzendbureau: true,
      branch: { select: { id: true, name: true, tenantId: true } },
      assignments: {
        where: { cancelledAt: null },
        select: { id: true, freelancer: { select: { id: true, userId: true, user: { select: { fullName: true } } } } },
      },
    },
  });
  if (!shift) throw AppError.forbidden("Je hebt geen toegang tot deze dienst.");
  return { principal, shift };
}

// a datetime-local value from the edit form ("2026-11-05T09:00", Dutch wall-clock) or a full ISO string
const whenSchema = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/));

const updateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  dresscode: z.string().trim().max(500).optional(),
  extraInfo: z.string().trim().max(1000).optional(),
  startsAt: whenSchema.optional(),
  endsAt: whenSchema.optional(),
  breakMinutes: z.number().int().min(0).max(240).optional(),
  hourlyRateCents: z
    .number()
    .int()
    .min(MIN_SHIFT_RATE_CENTS, {
      message: `Het minimum uurtarief is € ${(MIN_SHIFT_RATE_CENTS / 100).toFixed(2).replace(".", ",")}`,
    })
    .max(50000)
    .optional(),
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
    const starts = parsed.startsAt ? parseAmsterdamLocal(parsed.startsAt) : shift.startsAt;
    const ends = parsed.endsAt ? parseAmsterdamLocal(parsed.endsAt) : shift.endsAt;
    if (ends <= starts) return { ok: false, message: "Einde moet na de start liggen." };
    const lengthProblem = shiftLengthProblem({
      startsAt: starts,
      endsAt: ends,
      breakMinutes: parsed.breakMinutes ?? shift.breakMinutes,
      viaUitzendbureau: shift.viaUitzendbureau,
    });
    if (lengthProblem) return { ok: false, message: lengthProblem };
    if (parsed.positions !== undefined && parsed.positions < shift.assignments.length) {
      return { ok: false, message: `Er zijn al ${shift.assignments.length} krachten aangenomen.` };
    }

    // Moving the time of a dienst people are already booked on: it may not land
    // on another booking of theirs (lib/shifts/worker-overlap), without saying where.
    const timesChanged = starts.getTime() !== shift.startsAt.getTime() || ends.getTime() !== shift.endsAt.getTime();
    if (timesChanged && shift.assignments.length) {
      let clashes = 0;
      for (const a of shift.assignments) {
        if (await findOverlappingShift(prisma, a.freelancer.id, { shiftId: shift.id, startsAt: starts, endsAt: ends })) clashes += 1;
      }
      if (clashes) {
        return {
          ok: false,
          message: `Op het nieuwe tijdstip werkt ${clashes === 1 ? "een van je ingeplande krachten" : `${clashes} van je ingeplande krachten`} al elders. Kies een ander tijdstip of overleg eerst met ${clashes === 1 ? "die kracht" : "hen"}.`,
        };
      }
    }

    await prisma.$transaction([
      prisma.shift.update({
        where: { id: shift.id },
        data: {
          ...(parsed.title ? { title: parsed.title } : {}),
          ...(parsed.description !== undefined ? { description: parsed.description || null } : {}),
          ...(parsed.dresscode !== undefined ? { dresscode: parsed.dresscode || null } : {}),
          ...(parsed.extraInfo !== undefined ? { extraInfo: parsed.extraInfo || null } : {}),
          ...(parsed.startsAt ? { startsAt: starts } : {}),
          ...(parsed.endsAt ? { endsAt: ends } : {}),
          ...(parsed.breakMinutes !== undefined ? { breakMinutes: parsed.breakMinutes } : {}),
          ...(parsed.hourlyRateCents !== undefined ? { hourlyRateCents: parsed.hourlyRateCents } : {}),
          ...(parsed.positions !== undefined ? { positions: parsed.positions } : {}),
        },
      }),
      // The booked people's draft timesheets snapshot the planned times: keep them in step,
      // or hours handed in without own times would use the old ones. (The rate they accepted stays.)
      ...(shift.assignments.length && (timesChanged || parsed.breakMinutes !== undefined)
        ? [
            prisma.timesheet.updateMany({
              where: { assignmentId: { in: shift.assignments.map((a) => a.id) }, status: "DRAFT" },
              data: {
                scheduledStart: starts,
                scheduledEnd: ends,
                ...(parsed.breakMinutes !== undefined ? { breakMinutes: parsed.breakMinutes } : {}),
              },
            }),
          ]
        : []),
    ]);

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
        await postMessage(
          t.id,
          "system",
          timesChanged
            ? `De opdrachtgever heeft de tijd van deze dienst aangepast: nu ${overlapWhen({ startsAt: starts, endsAt: ends })}. Bekijk de klus opnieuw.`
            : "De opdrachtgever heeft de details van deze dienst aangepast. Bekijk de klus opnieuw.",
          "system",
        );
      } catch {
        /* non-fatal */
      }
    }
    // System chat messages send no push (lib/messaging/notify.ts), and a new time must not go unnoticed.
    if (timesChanged && shift.assignments.length) {
      const booked = shift.assignments.map((a) => a.freelancer.userId);
      runAfter(() =>
        sendLocalizedPush(booked, (t, locale) => ({
          title: t.timeChangedTitle(parsed.title ?? shift.title),
          body: t.timeChangedBody(pushWhen(locale, { startsAt: starts, endsAt: ends })),
          data: { type: "SHIFT", url: `/dashboard/klussen/${shift.id}`, tag: `tijd-${shift.id}` },
          ttlSeconds: 86_400,
        })),
      );
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
    // System chat messages send no push: tell the booked people now, not on the day itself.
    if (hadAssignees) {
      const booked = shift.assignments.map((a) => a.freelancer.userId);
      const cancelReason = reason.trim();
      runAfter(() =>
        sendLocalizedPush(booked, (t, locale) => ({
          title: t.cancelledTitle(shift.title),
          body: cancelReason ? t.cancelledReasonBody(pushWhen(locale, shift), cancelReason) : t.cancelledBody(pushWhen(locale, shift)),
          data: { type: "SHIFT", url: `/dashboard/klussen/${shift.id}`, tag: `geannuleerd-${shift.id}` },
          ttlSeconds: 86_400,
        })),
      );
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

/** Employer puts a pool-only shift on the open marketplace — matches/notifies everyone else. */
export async function publishShiftAction(shiftId: string): Promise<OfferResponse> {
  try {
    const { shift } = await assertOwnsShift(shiftId);
    if (shift.visibility !== "POOL_ONLY") {
      return { ok: false, message: "Deze dienst staat al op de open markt." };
    }
    if (["COMPLETED", "CANCELLED"].includes(shift.status)) {
      return { ok: false, message: "Deze dienst is al afgerond of geannuleerd." };
    }

    await prisma.shift.update({ where: { id: shift.id }, data: { visibility: "PUBLIC" } });
    try {
      await runMatchingForShift(shift.id);
    } catch {
      /* non-fatal — the shift is public either way; matching retries on the next tick */
    }
    // Now public: workers who follow this employer get a push.
    await notifyFollowersOfShifts([shift.id]).catch(() => undefined);
    await notifyJobAlerts([shift.id]).catch(() => undefined);

    revalidatePath(`/werkgever/diensten/${shift.id}`);
    revalidatePath("/werkgever/diensten");
    return { ok: true, message: "Dienst staat nu op de open markt." };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Publiceren mislukt." };
  }
}

/**
 * Een volle klus weer openzetten nadat een werker afzegde en "Klussen automatisch heropenen" uit staat (Instellingen → Klus-instellingen,
 * lib/werkgever/heropenen.ts). Precies wat een afzegging doet als automatisch heropenen aan staat: de klus gaat weer open (of staat
 * deels bezet), er start een zoektocht naar een vervanger en standby-werkers horen het. De melding is in de taal van het bedrijf.
 */
export async function heropenShiftAction(shiftId: string): Promise<OfferResponse> {
  const k = (await getDict().catch(() => nlDict)).klusWeerOpen;
  try {
    const { principal, shift } = await assertOwnsShift(shiftId);
    if (shift.status !== "FILLED") return { ok: false, message: k.nietVol };
    if (shift.assignments.length >= shift.positions) return { ok: false, message: k.alleBezet };
    if (shift.startsAt.getTime() <= Date.now()) return { ok: false, message: k.begonnen };

    await prisma.shift.update({ where: { id: shift.id }, data: { status: statusNaHeropenen(shift.assignments.length) } });
    runAfter(() => runMatchingForShift(shift.id));
    // binnen 24 uur: werkers op standby horen het meteen (lib/matching/standby); pas geladen als het nodig is
    runAfter(async () => (await import("@/lib/matching/standby")).notifyStandby(shift.id));

    await recordAudit({
      category: "MATCHING",
      action: "shift.reopened_by_employer",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Dienst "${shift.title}" door het bedrijf weer open gezet (${shift.assignments.length}/${shift.positions} bezet)`,
      targetType: "shift",
      targetId: shift.id,
    });

    revalidatePath(`/werkgever/diensten/${shift.id}`);
    revalidatePath("/werkgever/diensten");
    return { ok: true, message: k.gedaan };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: k.mislukt };
  }
}

/** "Zelfde team volgende week": repeat this klus N weeks later, offered privately to the same people first. */
export async function repeatShiftAction(shiftId: string, weeks = 1): Promise<OfferResponse & { shiftId?: string }> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    const res = await repeatWithSameTeam(principal, shiftId, weeks);
    revalidatePath("/werkgever/diensten");
    return {
      ok: true,
      shiftId: res.shiftId,
      message: res.invited
        ? `Klus herhaald — eerst privé aangeboden aan hetzelfde team (${res.invited} ${res.invited === 1 ? "persoon" : "personen"}).`
        : "Klus herhaald en op de open markt gezet (er was nog niemand ingepland om eerst te vragen).",
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Herhalen mislukt." };
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
    if (!offer) return { ok: false, message: "Reactie niet gevonden." };
    // A freelancer who simply agrees with the listed rate still goes through
    // this same Offer record — only call it a "tegenbod" when they actually
    // proposed a different one, so a plain reaction isn't framed as a negotiation.
    const isCounter = offer.proposedRateCents !== offer.listedRateCents;
    const noun = isCounter ? "tegenbod" : "reactie";
    const Noun = isCounter ? "Tegenbod" : "Reactie";
    const thisLabel = isCounter ? "Dit tegenbod" : "Deze reactie";
    if (offer.status !== "pending") return { ok: false, message: `${thisLabel} is al afgehandeld.` };

    // verify the employer owns the shift
    const scope = await resolveEmployerScope(principal);
    const scopeWhere = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
    const shift = await prisma.shift.findFirst({
      where: { AND: [{ id: offer.shiftId }, { branch: scopeWhere }] },
      select: { id: true, title: true, hourlyRateCents: true, status: true, startsAt: true, endsAt: true, branch: { select: { tenantId: true } } },
    });
    if (!shift) throw AppError.forbidden("Je hebt geen toegang tot deze dienst.");

    // Kiezen kan pas als het bedrijf is gecontroleerd (23 nov 2026): tot dan blijft de reactie gewoon openstaan en vraagt het scherm
    // om de bedrijfsgegevens. Dit staat hier op de server, niet alleen in het scherm (lib/company/gecontroleerd.ts).
    if (decision === "accepted" && !bedrijfMagDoen(await isTenantVerified(shift.branch.tenantId), "inplannen")) {
      return { ok: false, code: BEDRIJF_NOG_NIET_GECONTROLEERD, message: NOG_NIET_GECONTROLEERD_TEKST };
    }

    // Is de flexwerker intussen al ergens anders op dat moment ingepland? Dan
    // niets wijzigen (ook het tarief niet) en dat zonder de andere klant te noemen.
    if (decision === "accepted") {
      const worker = await prisma.freelancerProfile.findUnique({ where: { userId: offer.userId }, select: { id: true } });
      const overlap = worker
        ? await findOverlappingShift(prisma, worker.id, { shiftId: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt })
        : null;
      if (overlap) return { ok: false, message: overlapMessageOther(overlap) };
    }

    if (decision === "accepted" && offer.proposedRateCents < MIN_SHIFT_RATE_CENTS) {
      return {
        ok: false,
        message: `${thisLabel} (${eur(offer.proposedRateCents)}/u) ligt onder het minimum uurtarief van ${eur(MIN_SHIFT_RATE_CENTS)}.`,
      };
    }

    if (decision === "accepted") {
      // The shift now pays the agreed rate (employer's own shift) — update
      // before finalising so the assignment/timesheet snapshot the agreed rate.
      if (["OPEN", "MATCHING", "PARTIALLY_FILLED"].includes(shift.status)) {
        await prisma.shift.update({
          where: { id: shift.id },
          data: { hourlyRateCents: offer.proposedRateCents },
        });
      }
      // The freelancer's tegenbod is their signature; the employer accepting
      // it is the counter-signature (see ensureModelAgreement) — so this
      // finalises the assignment right away. There is no separate "aannemen"
      // control left for the freelancer to click once they've already reacted,
      // so leaving it unfinished here made the shift silently vanish for them.
      try {
        await applyToShift(offer.userId, shift.id);
      } catch (e) {
        // de kracht mist zelf nog gegevens (KVK/btw/KOR, rekeningnummer, ...): de reden is voor hem ("Vul ze in bij
        // Verificatie"); de werkgever leest een eigen, neutrale zin in zijn taal (lib/fiscal/werker-niet-klaar.ts)
        if (isWerkerNietKlaar(e)) return { ok: false, message: (await getDict().catch(() => nlDict)).kandidaatKaart.werkerNietKlaar };
        return {
          ok: false,
          message:
            e instanceof AppError
              ? `Accepteren is gelukt, maar toewijzen is niet gelukt: ${e.message}`
              : "Accepteren is gelukt, maar de dienst automatisch toewijzen is mislukt.",
        };
      }
      await setOfferStatus(offerId, decision);
      await recordAudit({
        category: "MATCHING",
        action: "offer.accepted",
        actorUserId: principal.userId,
        actorLabel: "user",
        summary: `${Noun} (${eur(offer.proposedRateCents)}/u) geaccepteerd voor "${shift.title}"`,
        targetType: "shift",
        targetId: shift.id,
      });
    } else {
      await setOfferStatus(offerId, decision);
      runAfter(() => pushOfferDeclined(offer.userId, { id: shift.id, title: shift.title }));
    }
    // Gekozen of afgewezen: dan staat hij niet meer op de reservebank (lezen filtert hem ook al weg; dit ruimt op).
    await haalVanReservebank({ id: shift.id, tenantId: shift.branch.tenantId }, offerId).catch(() => undefined);
    // "uitgekozen" push right away (the sweep would also catch it)
    if (decision === "accepted") {
      runAfter(() => maybeSweepWorkerPushes());
      // mail aan de werker in zijn/haar taal
      const shiftId2 = shift.id;
      const shiftTitle2 = shift.title;
      const startsAt2 = shift.startsAt;
      const endsAt2 = shift.endsAt;
      const workerUserId2 = offer.userId;
      runAfter(async () => {
        const locales = await userLocales([workerUserId2]);
        const locale = locales.get(workerUserId2) ?? "nl";
        const werker = await prisma.user.findUnique({ where: { id: workerUserId2 }, select: { email: true, fullName: true } });
        if (!werker) return;
        const tenant = await prisma.tenant.findUnique({ where: { id: shift.branch.tenantId }, select: { name: true } });
        const bedrijf = tenant?.name ?? "";
        const when = pushDayMonth(locale, startsAt2) + "–" + new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(endsAt2);
        const mail = uitgekozenEmailT({ fullName: werker.fullName, title: shiftTitle2, bedrijf, when, link: `https://zekerflex.com/dashboard/klussen/${shiftId2}` }, locale);
        await sendMail({ ...mail, to: werker.email }).catch(() => undefined);
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
          ? `Je ${noun} is geaccepteerd. Je bent toegewezen aan "${shift.title}" tegen ${eur(offer.proposedRateCents)}/u.`
          : `Je ${noun} voor "${shift.title}" is helaas afgewezen.${
              isCounter ? ` Het oorspronkelijke tarief van ${eur(offer.listedRateCents)}/u blijft gelden.` : ""
            }`,
        "system",
      );
    } catch {
      /* non-fatal */
    }

    revalidatePath(`/werkgever/diensten/${offer.shiftId}`);
    revalidatePath("/werkgever/diensten");
    return {
      ok: true,
      message: decision === "accepted" ? `${Noun} geaccepteerd — de kracht is toegewezen aan de dienst.` : `${Noun} afgewezen.`,
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Actie mislukt." };
  }
}

/**
 * Reservebank (lib/reservebank): een open reactie achter de hand houden in plaats van afwijzen, of er weer af halen.
 * De reactie blijft gewoon openstaan; inplannen gaat later via respondToOfferAction (dezelfde weg als altijd).
 * Alleen het bedrijf zelf past de bank aan; het beheer van ZekerFlex kan hem alleen zien.
 */
export async function zetReserveAction(offerId: string, aan: boolean): Promise<OfferResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    const offer = (await listCounterOffers(500)).find((o) => o.id === offerId);
    if (!offer) return { ok: false, message: "Reactie niet gevonden." };
    const { shift } = await assertOwnsShift(offer.shiftId);
    const klus = { id: shift.id, tenantId: shift.branch.tenantId };
    if (reservebankToegang(principal.grants, { tenantId: shift.branch.tenantId, branchId: shift.branch.id }) !== "schrijven") {
      return { ok: false, message: "Alleen het bedrijf zelf kan de reservebank aanpassen." };
    }

    if (aan) {
      if (offer.status !== "pending") return { ok: false, message: "Deze reactie is al afgehandeld." };
      if (!reservebankOpen(shift, Date.now())) {
        return { ok: false, message: "Deze klus is al begonnen of gaat niet door: de reservebank telt niet meer." };
      }
      await zetOpReservebank(klus, offer.id);
      // push aan de werker: je staat op de reservebank
      const tenantNaam = await prisma.tenant.findUnique({ where: { id: shift.branch.tenantId }, select: { name: true } }).then((t) => t?.name ?? shift.branch.tenantId);
      const shiftTitle = shift.title;
      const shiftId = shift.id;
      const userId = offer.userId;
      runAfter(() => sendLocalizedPush([userId], (t, locale) => ({ title: t.reserveTitle(shiftTitle), body: t.reserveBody(tenantNaam, pushWhen(locale, shift)), data: { type: "SHIFT", url: `/dashboard/klussen/${shiftId}`, tag: `reserve-${shiftId}` }, ttlSeconds: 86_400 })));
    } else {
      await haalVanReservebank(klus, offer.id);
    }

    await recordAudit({
      category: "MATCHING",
      action: aan ? "reservebank.added" : "reservebank.removed",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Reactie ${aan ? "op de reservebank gezet" : "van de reservebank gehaald"} voor "${shift.title}"`,
      targetType: "shift",
      targetId: shift.id,
    });

    revalidatePath(`/werkgever/diensten/${shift.id}`);
    return { ok: true, message: aan ? "Op de reservebank gezet." : "Van de reservebank gehaald." };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Actie mislukt." };
  }
}
