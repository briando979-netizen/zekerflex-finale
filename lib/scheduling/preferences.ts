import { prisma } from "@/lib/prisma";
import { z } from "zod";

const preferencesSchema = z.object({
  freelancerId: z.string(),
  preferredTimeSlots: z.array(z.enum(["MORNING", "AFTERNOON", "EVENING", "NIGHT"])),
  preferredLocations: z.array(z.string()).optional(),
  preferredShiftTypes: z.array(z.enum(["SHORT", "STANDARD", "LONG"])),
  minHourlyRate: z.number().positive(),
  maxKmFromHome: z.number().positive(),
  industryPreferences: z.array(z.string()).optional(),
});

export async function setPreferences(data: z.infer<typeof preferencesSchema>) {
  const validated = preferencesSchema.parse(data);
  return prisma.freelancerPreferences.upsert({
    where: { freelancerId: data.freelancerId },
    create: validated,
    update: validated,
  });
}

export async function scoreShiftForWorker(
  freelancerId: string,
  shiftId: string
): Promise<{ score: number; matches: string[] }> {
  const prefs = await prisma.freelancerPreferences.findUnique({
    where: { freelancerId },
  });
  if (!prefs) return { score: 0, matches: [] };

  const shift = await prisma.shift.findUniqueOrThrow({
    where: { id: shiftId },
    include: { location: true },
  });

  const matches: string[] = [];
  let score = 50;

  if (prefs.preferredTimeSlots?.includes(shift.timeSlot as any)) {
    score += 20;
    matches.push("Preferred time slot");
  }

  if (prefs.preferredLocations?.includes(shift.location?.id || "")) {
    score += 15;
    matches.push("Preferred location");
  }

  if (shift.hourlyRate >= prefs.minHourlyRate) {
    score += 15;
    matches.push("Meets minimum rate");
  }

  if (prefs.industryPreferences?.includes(shift.industry || "")) {
    score += 10;
    matches.push("Preferred industry");
  }

  return { score: Math.min(100, score), matches };
}
