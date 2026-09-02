import { prisma } from "@/lib/prisma";
import {
  abuPhase,
  stippRegeling,
  STIPP_BASIS_START_WEEK,
  STIPP_PLUS_START_WEEK,
} from "@/lib/payroll/compute";

// ---------------------------------------------------------------------------
// Uitzendkracht status: ABU-fase, StiPP-pensioen en contracturen — afgeleid
// van de goedgekeurde/uitbetaalde timesheets. Read-only.
// ---------------------------------------------------------------------------

// Contract hour thresholds (ABU): a next contract offer is triggered around
// these cumulative hours.
const NEXT_CONTRACT_HOURS = 416; // ~13 weeks * 32h — a phase-A contract block

export interface UitzendStatus {
  weeksWorked: number;
  hoursWorked: number;
  phase: "A" | "B" | "C";
  phaseLabel: string;
  stipp: "geen" | "basis" | "plus";
  stippLabel: string;
  weeksToStippBasis: number;
  weeksToStippPlus: number;
  // contract
  currentContractHours: number;
  nextContractAtHours: number;
  hoursToNextContract: number;
  nextContractReady: boolean;
}

const PHASE_LABEL: Record<string, string> = {
  A: "Fase A — uitzendbeding, tot 52 gewerkte weken",
  B: "Fase B — tijdelijke contracten, week 53 t/m 208",
  C: "Fase C — contract voor onbepaalde tijd",
};
const STIPP_LABEL: Record<string, string> = {
  geen: "Nog geen pensioenopbouw (start in week 9)",
  basis: "Basisregeling — pensioenopbouw loopt",
  plus: "Plusregeling — volledige opbouw met werkgeversbijdrage",
};

export async function getUitzendStatus(userId: string): Promise<UitzendStatus | null> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) return null;

  const timesheets = await prisma.timesheet.findMany({
    where: { freelancerId: profile.id, status: { in: ["APPROVED", "PAID", "SUBMITTED"] } },
    select: { billableMinutes: true, scheduledStart: true },
  });

  const hoursWorked = Math.round((timesheets.reduce((s, t) => s + t.billableMinutes, 0) / 60) * 10) / 10;
  const weekKeys = new Set(
    timesheets.map((t) => {
      const d = new Date(t.scheduledStart);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
      return `${d.getFullYear()}-${week}`;
    }),
  );
  const weeksWorked = weekKeys.size;

  const phase = abuPhase(weeksWorked);
  const stipp = stippRegeling(weeksWorked);

  const currentContractHours = Math.floor(hoursWorked / NEXT_CONTRACT_HOURS) * NEXT_CONTRACT_HOURS;
  const nextContractAtHours = currentContractHours + NEXT_CONTRACT_HOURS;
  const hoursToNextContract = Math.max(0, nextContractAtHours - hoursWorked);

  return {
    weeksWorked,
    hoursWorked,
    phase,
    phaseLabel: PHASE_LABEL[phase] ?? phase,
    stipp,
    stippLabel: STIPP_LABEL[stipp] ?? stipp,
    weeksToStippBasis: Math.max(0, STIPP_BASIS_START_WEEK - weeksWorked),
    weeksToStippPlus: Math.max(0, STIPP_PLUS_START_WEEK - weeksWorked),
    currentContractHours,
    nextContractAtHours,
    hoursToNextContract,
    nextContractReady: hoursWorked >= nextContractAtHours - 8 && hoursWorked > 0,
  };
}
