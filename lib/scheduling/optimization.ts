import { prisma } from "@/lib/prisma";

interface AssignmentRequest {
  shiftId: string;
  candidateIds: string[];
  urgency: "LOW" | "MEDIUM" | "HIGH";
}

interface OptimalMatch {
  freelancerId: string;
  score: number;
  reasoning: string[];
}

export async function optimizeAssignment(req: AssignmentRequest): Promise<OptimalMatch[]> {
  const shift = await prisma.shift.findUniqueOrThrow({ where: { id: req.shiftId } });
  const candidates = await prisma.freelancerProfile.findMany({
    where: { userId: { in: req.candidateIds } },
    include: { skills: true, ratings: true },
  });

  const scored = candidates
    .map((c) => {
      const reasoning: string[] = [];
      let score = 50; // baseline

      // Skill match
      const skillMatch = c.skills.filter((s) => shift.requiredSkills?.includes(s.naam));
      if (skillMatch.length > 0) {
        score += skillMatch.length * 15;
        reasoning.push(`${skillMatch.length} matching skills`);
      }

      // Rating boost
      const avgRating = c.ratings.length ? c.ratings.reduce((a, r) => a + r.score, 0) / c.ratings.length : 0;
      if (avgRating >= 4.5) {
        score += 20;
        reasoning.push("High rating");
      } else if (avgRating < 3.5) {
        score -= 15;
        reasoning.push("Low rating");
      }

      // Urgency impact
      if (req.urgency === "HIGH" && c.ratings.length > 10) {
        score += 10;
        reasoning.push("Experienced, available for urgent");
      }

      return { freelancerId: c.userId, score: Math.min(100, score), reasoning };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5);
}
