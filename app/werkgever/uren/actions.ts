"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { approveTimesheet } from "@/lib/timesheets/approve";
import { BULK_MAX, bulkBericht, schoneUren } from "@/lib/timesheets/bulk-goedkeuren";
import { fraudForTimesheets } from "@/lib/fraud/timesheet";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { raiseManagerReviewDispute, proposeHoursCorrection } from "@/lib/disputes/raise";
import { AppError } from "@/lib/errors";

export interface ApproveResult {
  ok: boolean;
  message: string;
}

/**
 * `overrideGpsCheck` is only ever sent after the UI has already shown the
 * employer the specific flag(s) and they explicitly confirmed — see
 * ApproveButton.tsx. Only used when none of the flags are critical; a
 * critical signal routes to requestManualReviewAction instead.
 */
export async function approveTimesheetAction(
  timesheetId: string,
  overrideGpsCheck = false,
): Promise<ApproveResult> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    const result = await approveTimesheet({ timesheetId, principal, overrideGpsCheck });
    // Refresh the dashboard KPIs, but NOT this list: revalidating /werkgever/uren
    // here re-renders the list synchronously (Next 15), which unmounts the
    // ApproveButton before it can show the "Goedgekeurd" confirmation. The
    // approved row stays visible with its green pill until the next navigation.
    revalidatePath("/werkgever");
    return {
      ok: true,
      message:
        result.track === "payroll"
          ? result.advance
            ? `Goedgekeurd. € ${(result.advance.netCents / 100).toFixed(2).replace(".", ",")} is als voorschot uitbetaald; de rest volgt op de loonstrook van week ${result.payroll?.weekLabel ?? ""}.`.trim()
            : `Goedgekeurd. De uren worden verloond in de payroll van week ${result.payroll?.weekLabel ?? ""}.`.trim()
          : result.payout?.status === "FAILED"
            ? "Goedgekeurd. De uitbetaling wordt automatisch opnieuw geprobeerd."
            : "Goedgekeurd en uitbetaling gestart.",
    };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    // Toon de echte oorzaak i.p.v. een generieke tekst, zodat een
    // onverwachte fout (bv. een wegvallende dienst) meteen zichtbaar is.
    console.error("approveTimesheetAction failed", err);
    const reason = err instanceof Error ? err.message : "onbekende fout";
    return { ok: false, message: `Goedkeuren mislukt: ${reason}`.slice(0, 180) };
  }
}

/**
 * "Keur alles zonder signaal goed": de ids die de werkgever op het scherm zag.
 * De server kijkt per id opnieuw (eigen vestiging, nog ingediend, geen signaal,
 * geen extra kosten; lib/timesheets/bulk-goedkeuren.ts) en keurt dan elk
 * briefje apart goed met dezelfde approveTimesheet() als de knop per rij,
 * zonder GPS-uitzondering. Wat intussen veranderde, blijft staan.
 */
export async function approveCleanTimesheetsAction(timesheetIds: string[]): Promise<ApproveResult> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    const ids = [...new Set(Array.isArray(timesheetIds) ? timesheetIds : [])]
      .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128)
      .slice(0, BULK_MAX);
    if (ids.length === 0) return { ok: false, message: "Er zijn geen uren gekozen." };

    const scope = await resolveEmployerScope(principal);
    const branchFilter = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
    const rijen = await prisma.timesheet.findMany({
      where: { id: { in: ids }, branch: branchFilter, status: "SUBMITTED" },
      select: {
        id: true,
        status: true,
        extraCostsCents: true,
        scheduledStart: true,
        scheduledEnd: true,
        actualStart: true,
        actualEnd: true,
        breakMinutes: true,
        billableMinutes: true,
        freelancerId: true,
        gpsEvents: { select: { type: true, mocked: true, withinGeofence: true, distanceToBranchMeters: true, recordedAt: true } },
      },
    });
    // in de volgorde van het scherm
    const opVolgorde = ids.flatMap((id) => rijen.filter((r) => r.id === id));
    const kies = schoneUren(opVolgorde, await fraudForTimesheets(opVolgorde));

    let goedgekeurd = 0;
    let mislukt = 0;
    for (const timesheetId of kies) {
      try {
        await approveTimesheet({ timesheetId, principal });
        goedgekeurd++;
      } catch (err) {
        mislukt++;
        console.error("approveCleanTimesheetsAction: één briefje niet goedgekeurd", timesheetId, err instanceof Error ? err.message : err);
      }
    }
    revalidatePath("/werkgever");
    revalidatePath("/werkgever/uren");
    return { ok: goedgekeurd > 0, message: bulkBericht(goedgekeurd, mislukt, ids.length - kies.length) };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    console.error("approveCleanTimesheetsAction failed", err);
    return { ok: false, message: "Goedkeuren mislukt. Probeer het opnieuw." };
  }
}

/**
 * For a timesheet approveTimesheet() refuses on a CRITICAL signal (mock GPS,
 * severe geofence miss, impossible hours, overlap) — a regular manager can't
 * (and shouldn't be able to) override that themselves. This routes it into
 * the admin Dispute Console instead of leaving it permanently stuck.
 */
export async function requestManualReviewAction(timesheetId: string): Promise<ApproveResult> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    await raiseManagerReviewDispute({
      timesheetId,
      principal,
      reason: `${principal.email} vroeg platformcontrole aan vanwege een signaal bij goedkeuring`,
    });
    revalidatePath("/werkgever/uren");
    return { ok: true, message: "Platformcontrole aangevraagd — dit urenbriefje wordt door ZekerFlex beoordeeld." };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Aanvragen mislukt. Probeer het opnieuw." };
  }
}

/**
 * The hours equivalent of the existing shift-rate tegenbod: instead of
 * silently overriding the freelancer's submitted hours at approval time,
 * propose a correction they explicitly accept or reject (lib/disputes/respond.ts).
 */
export async function proposeHoursCorrectionAction(
  timesheetId: string,
  proposedHours: number,
  note: string,
): Promise<ApproveResult> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
    await proposeHoursCorrection({
      timesheetId,
      principal,
      proposedMinutes: Math.round(proposedHours * 60),
      note,
    });
    revalidatePath("/werkgever/uren");
    return { ok: true, message: "Correctievoorstel verstuurd — de flexwerker moet nog akkoord gaan." };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, message: err.message };
    return { ok: false, message: "Voorstellen mislukt. Probeer het opnieuw." };
  }
}
