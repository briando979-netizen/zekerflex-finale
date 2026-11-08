import { prisma } from "@/lib/prisma";

export interface ScheduleSuggestion {
  shiftId: string;
  freelancerId: string;
  confidence: number;
  reason: string;
}

export async function suggestAssignments(shiftIds: string[]): Promise<ScheduleSuggestion[]> {
  const shifts = await prisma.shift.findMany({
    where: { id: { in: shiftIds }, status: "OPEN" },
    include: { requiredSkills: true },
  });

  const suggestions: ScheduleSuggestion[] = [];

  for (const shift of shifts) {
    const candidates = await prisma.freelancerProfile.findMany({
      where: {
        skills: { some: { naam: { in: shift.requiredSkills } } },
        availability: {
          some: {
            dayOfWeek: getDayOfWeek(shift.startTime),
          },
        },
      },
      include: { ratings: true, assignments: true },
    });

    const top = candidates
      .map((c) => {
        const rating = c.ratings.length ? c.ratings.reduce((a, r) => a + r.score, 0) / c.ratings.length : 3;
        const confidence = Math.min(100, (rating / 5) * 100 - (c.assignments.length * 5));
        return { freelancerId: c.userId, confidence };
      })
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (top && top.confidence > 40) {
      suggestions.push({
        shiftId: shift.id,
        freelancerId: top.freelancerId,
        confidence: top.confidence,
        reason: `High match: rating & availability align`,
      });
    }
  }

  return suggestions;
}

function getDayOfWeek(date: Date): string {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return days[date.getDay()];
}

export async function autoScheduleShifts(shiftIds: string[]) {
  const suggestions = await suggestAssignments(shiftIds);
  const results = [];

  for (const sugg of suggestions) {
    try {
      const assignment = await prisma.assignment.create({
        data: {
          shiftId: sugg.shiftId,
          freelancerId: sugg.freelancerId,
          status: "SUGGESTED",
          confidence: sugg.confidence,
        },
      });
      results.push({ success: true, assignment });
    } catch (err) {
      results.push({ success: false, error: String(err) });
    }
  }

  return results;
}
