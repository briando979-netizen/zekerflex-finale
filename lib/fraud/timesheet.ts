import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Deterministische fraude-/fouten-detectie op urenbriefjes:
//   • valse GPS (mock-provider), check-in buiten de geofence, geen check-in
//   • onmogelijke tijden (te lang, eindtijd voor begintijd, 0 uur)
//   • pauzemisbruik (geen wettelijke pauze / absurd lange pauze)
//   • dubbele uren (overlappende urenbriefjes van dezelfde kracht)
// Pure evaluatiefunctie + een DB-helper die de context ophaalt.
// ---------------------------------------------------------------------------

export type FraudSeverity = "info" | "warning" | "critical";

export interface FraudFlag {
  code: string;
  severity: FraudSeverity;
  message: string;
}

export interface FraudInput {
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  breakMinutes: number;
  billableMinutes: number;
  gpsEvents: {
    type: string;
    mocked: boolean;
    withinGeofence: boolean;
    distanceToBranchMeters: number;
    recordedAt: Date;
  }[];
  /** aantal andere niet-afgewezen urenbriefjes van dezelfde kracht dat overlapt */
  overlappingCount: number;
}

const MIN = 60_000;

export function evaluateTimesheetFraud(i: FraudInput): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const start = i.actualStart ?? i.scheduledStart;
  const end = i.actualEnd ?? i.scheduledEnd;
  const grossMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / MIN));
  const workedMin = i.billableMinutes > 0 ? i.billableMinutes : Math.max(0, grossMin - i.breakMinutes);

  // --- GPS ---
  const checkIn = i.gpsEvents.find((e) => e.type === "CHECK_IN");
  if (i.gpsEvents.some((e) => e.mocked)) {
    flags.push({ code: "MOCK_GPS", severity: "critical", message: "GPS kwam van een nep-locatie-app (mock provider)." });
  }
  if (!checkIn) {
    flags.push({ code: "NO_CHECKIN", severity: "warning", message: "Geen GPS-check-in op locatie geregistreerd." });
  } else if (!checkIn.withinGeofence) {
    const m = Math.round(checkIn.distanceToBranchMeters);
    flags.push({
      code: "GEOFENCE_FAIL",
      severity: m > 750 ? "critical" : "warning",
      message: `Check-in was ${m} m buiten de vestiging.`,
    });
  }
  if (checkIn && checkIn.recordedAt.getTime() < i.scheduledStart.getTime() - 45 * MIN) {
    flags.push({ code: "CHECKIN_EARLY", severity: "info", message: "Check-in ruim vóór de geplande starttijd." });
  }

  // --- onmogelijke tijden ---
  if (i.actualStart && i.actualEnd && i.actualEnd.getTime() <= i.actualStart.getTime()) {
    flags.push({ code: "END_BEFORE_START", severity: "critical", message: "Eindtijd ligt op of vóór de begintijd." });
  }
  if (workedMin <= 0) {
    flags.push({ code: "ZERO_HOURS", severity: "critical", message: "Nul declarabele minuten." });
  }
  if (workedMin > 16 * 60) {
    flags.push({ code: "DURATION_TOO_LONG", severity: "critical", message: `${(workedMin / 60).toFixed(1)} gewerkte uren op één dienst — controleer dit.` });
  } else if (workedMin > 12 * 60) {
    flags.push({ code: "DURATION_LONG", severity: "warning", message: `${(workedMin / 60).toFixed(1)} gewerkte uren — boven de gebruikelijke 12 uur.` });
  }

  // ingevulde uren wijken sterk af van de planning
  const plannedMin = Math.max(0, Math.round((i.scheduledEnd.getTime() - i.scheduledStart.getTime()) / MIN) - i.breakMinutes);
  if (plannedMin > 0 && Math.abs(workedMin - plannedMin) > 120) {
    flags.push({
      code: "PLAN_MISMATCH",
      severity: "warning",
      message: `Ingevulde uren wijken ${Math.round(Math.abs(workedMin - plannedMin) / 60 * 10) / 10} u af van de planning.`,
    });
  }

  // --- pauze ---
  if (grossMin > 330 && i.breakMinutes < 30) {
    flags.push({ code: "BREAK_MISSING", severity: "warning", message: "Meer dan 5,5 uur gewerkt zonder de wettelijke pauze van 30 minuten." });
  }
  if (i.breakMinutes > 180 || (grossMin > 0 && i.breakMinutes / grossMin > 0.4)) {
    flags.push({ code: "BREAK_EXCESSIVE", severity: "info", message: `Pauze van ${i.breakMinutes} min is opvallend lang voor deze dienst.` });
  }

  // --- dubbele uren ---
  if (i.overlappingCount > 0) {
    flags.push({
      code: "OVERLAP",
      severity: "critical",
      message: `Overlapt met ${i.overlappingCount} ander${i.overlappingCount === 1 ? "" : "e"} urenbriefje${i.overlappingCount === 1 ? "" : "s"} van dezelfde kracht.`,
    });
  }

  return flags.sort((a, b) => sev(b.severity) - sev(a.severity));
}

const sev = (s: FraudSeverity) => (s === "critical" ? 2 : s === "warning" ? 1 : 0);

export interface TimesheetFraudRow {
  id: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  breakMinutes: number;
  billableMinutes: number;
  freelancerId: string;
  gpsEvents: FraudInput["gpsEvents"];
}

/** Haal de context op en evalueer één urenbriefje. */
export async function fraudForTimesheet(timesheetId: string): Promise<FraudFlag[]> {
  const ts = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: {
      id: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualEnd: true,
      breakMinutes: true,
      billableMinutes: true,
      freelancerId: true,
      gpsEvents: {
        select: { type: true, mocked: true, withinGeofence: true, distanceToBranchMeters: true, recordedAt: true },
      },
    },
  });
  if (!ts) return [];
  return evaluateTimesheetFraud({
    ...ts,
    overlappingCount: await countOverlaps(ts),
  });
}

async function countOverlaps(ts: {
  id: string;
  freelancerId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}): Promise<number> {
  return prisma.timesheet.count({
    where: {
      id: { not: ts.id },
      freelancerId: ts.freelancerId,
      status: { in: ["SUBMITTED", "APPROVED", "PAID", "DISPUTED"] },
      scheduledStart: { lt: ts.scheduledEnd },
      scheduledEnd: { gt: ts.scheduledStart },
    },
  });
}

/** Batch: flags per timesheet-id voor een lijst-weergave. */
export async function fraudForTimesheets(rows: TimesheetFraudRow[]): Promise<Map<string, FraudFlag[]>> {
  const out = new Map<string, FraudFlag[]>();
  await Promise.all(
    rows.map(async (r) => {
      const overlappingCount = await countOverlaps(r);
      out.set(r.id, evaluateTimesheetFraud({ ...r, overlappingCount }));
    }),
  );
  return out;
}
