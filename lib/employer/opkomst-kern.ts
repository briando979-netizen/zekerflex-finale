import { workerMissed } from "@/lib/profile/card";

// Puur: de opkomsttelling van een werker uit zijn (afgelopen) inplanningen. Gedeeld door de profielkaart
// (lib/employer/candidate-card.ts) en de reactie-rijen (lib/employer/opkomst.ts), zodat beide hetzelfde getal tonen.

export interface OpkomstRij {
  cancelledAt: Date | null;
  cancelReason: string | null;
  timesheet: { status: string; actualStart: Date | null } | null;
  shift: { endsAt: Date };
}

const KWAM_STATUSSEN = ["SUBMITTED", "APPROVED", "DISPUTED", "PAID"];

/**
 * Verschenen tegenover gemist op diensten die al voorbij zijn. Alleen wat de werker zelf afzegde of liet schieten
 * telt als gemist (workerMissed); een annulering door het bedrijf of een overdracht aan een vervanger telt niet mee.
 */
export function telOpkomst(rijen: readonly OpkomstRij[], now = new Date()): { attendancePct: number | null; showed: number; missed: number; cancellations: number } {
  let showed = 0;
  let missed = 0;
  let cancellations = 0;
  for (const a of rijen) {
    if (a.cancelledAt && workerMissed(a.cancelReason)) cancellations += 1;
    if (a.shift.endsAt >= now) continue;
    if (a.cancelledAt) {
      if (workerMissed(a.cancelReason)) missed += 1;
      continue;
    }
    const ts = a.timesheet;
    const kwam = ts?.actualStart != null || KWAM_STATUSSEN.includes(ts?.status ?? "");
    if (kwam) showed += 1;
    else missed += 1;
  }
  const attendancePct = showed + missed > 0 ? Math.round((showed / (showed + missed)) * 100) : null;
  return { attendancePct, showed, missed, cancellations };
}
