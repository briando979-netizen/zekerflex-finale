import { ShiftStatus, type Shift } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

/**
 * Bulk shift creation voor werkgevers
 * Herhaalde klussen (bijv. receptionist ma-vr 9-17)
 */

export interface BulkShiftInput {
  branchId: string;
  title: string;
  description?: string;
  dresscode?: string;
  extraInfo?: string;
  hourlyRateCents: number;
  breakMinutes: number;
  positions: number;
  viaUitzendbureau?: boolean;
  requiredSkillId?: string;
  minSkillRating?: number;

  // Herhalingsschema: enkele datums of herhalend patroon
  dates: string[]; // ISO 8601 dates: 2026-11-08
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  createdByUserId?: string;
}

export interface BulkShiftResult {
  created: number;
  shifts: Shift[];
  errors: Array<{ date: string; error: string }>;
}

/**
 * Maak meerdere shifts in één actie
 * Valideer eerst, maak dan alle shifts atomair (of helemaal niet)
 */
export async function createBulkShifts(input: BulkShiftInput): Promise<BulkShiftResult> {
  // Valideer inputs
  if (!input.dates || input.dates.length === 0) {
    throw AppError.validation("Minstens één datum vereist");
  }
  if (input.dates.length > 100) {
    throw AppError.validation("Maximaal 100 klussen tegelijk (te veel)");
  }
  if (input.positions < 1 || input.positions > 50) {
    throw AppError.validation("Aantal posities moet 1-50 zijn");
  }

  const errors: Array<{ date: string; error: string }> = [];
  const shiftsToCreate: Array<Parameters<typeof prisma.shift.create>[0]["data"]> = [];

  // Bouw shift-objecten (validatie per datum)
  for (const date of input.dates) {
    try {
      const startDateTime = new Date(`${date}T${input.startTime}:00Z`);
      const endDateTime = new Date(`${date}T${input.endTime}:00Z`);

      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        errors.push({ date, error: "Ongeldig tijdstip" });
        continue;
      }

      if (startDateTime >= endDateTime) {
        errors.push({ date, error: "Starttijd moet voor eindtijd liggen" });
        continue;
      }

      // Deze shift is klaar voor aanmaak
      shiftsToCreate.push({
        branchId: input.branchId,
        title: input.title,
        description: input.description,
        dresscode: input.dresscode,
        extraInfo: input.extraInfo,
        hourlyRateCents: input.hourlyRateCents,
        breakMinutes: input.breakMinutes,
        positions: input.positions,
        viaUitzendbureau: input.viaUitzendbureau || false,
        requiredSkillId: input.requiredSkillId,
        minSkillRating: input.minSkillRating || 0,
        startsAt: startDateTime,
        endsAt: endDateTime,
        status: ShiftStatus.OPEN,
        visibility: "PUBLIC",
        createdByUserId: input.createdByUserId,
      });
    } catch (err) {
      errors.push({ date, error: (err as Error).message });
    }
  }

  if (shiftsToCreate.length === 0) {
    throw AppError.validation(`Geen geldige datums: ${errors.map((e) => e.error).join(", ")}`);
  }

  // Maak allemaal in één transactie
  const shifts = await prisma.$transaction(
    shiftsToCreate.map((data) => prisma.shift.create({ data })),
  );

  logger.info("bulk-shifts-created", {
    count: shifts.length,
    branchId: input.branchId,
    errors: errors.length,
  });

  return {
    created: shifts.length,
    shifts,
    errors,
  };
}

/**
 * Duplicate shift: kopieer naar nieuwe datums
 */
export async function duplicateShift(
  originalShiftId: string,
  newDates: string[],
  createdByUserId?: string,
): Promise<BulkShiftResult> {
  const original = await prisma.shift.findUnique({
    where: { id: originalShiftId },
    select: {
      branchId: true,
      title: true,
      description: true,
      dresscode: true,
      extraInfo: true,
      hourlyRateCents: true,
      breakMinutes: true,
      positions: true,
      viaUitzendbureau: true,
      requiredSkillId: true,
      minSkillRating: true,
    },
  });

  if (!original) {
    throw AppError.notFound("Klus niet gevonden");
  }

  const startTime = new Date(original.startsAt || new Date())
    .toISOString()
    .split("T")[1]
    .slice(0, 5);
  const endTime = new Date(original.endsAt || new Date()).toISOString().split("T")[1].slice(0, 5);

  return createBulkShifts({
    branchId: original.branchId,
    title: original.title,
    description: original.description,
    dresscode: original.dresscode,
    extraInfo: original.extraInfo,
    hourlyRateCents: original.hourlyRateCents,
    breakMinutes: original.breakMinutes,
    positions: original.positions,
    viaUitzendbureau: original.viaUitzendbureau,
    requiredSkillId: original.requiredSkillId,
    minSkillRating: original.minSkillRating,
    dates: newDates,
    startTime,
    endTime,
    createdByUserId,
  });
}
