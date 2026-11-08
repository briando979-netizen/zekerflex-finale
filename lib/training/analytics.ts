import { prisma } from "@/lib/prisma";

export async function getTrainingAnalytics(programId: string) {
  const enrollments = await prisma.userEnrollment.findMany({
    where: { programId },
    include: { completions: true, program: true },
  });

  const total = enrollments.length;
  const completed = enrollments.filter(e =>
    e.completions.length === e.program.modules.length
  ).length;
  const inProgress = total - completed;

  const completionRate = total > 0 ? (completed / total) * 100 : 0;
  const avgTimeHours = enrollments.reduce((sum, e) => sum + (e.program?.durationHours || 0), 0) / total || 0;

  const proficiencyScores = enrollments
    .filter(e => e.completions.some(c => c.quizScore))
    .map(e => e.completions.reduce((sum, c) => sum + (c.quizScore || 0), 0) / e.completions.length);

  const avgProficiency = proficiencyScores.length > 0
    ? proficiencyScores.reduce((a, b) => a + b) / proficiencyScores.length
    : 0;

  return {
    program: enrollments[0]?.program,
    total,
    completed,
    inProgress,
    completionRate,
    avgProficiency,
    avgTimeHours,
  };
}

export async function getROI(programId: string) {
  const analytics = await getTrainingAnalytics(programId);
  const program = await prisma.trainingProgram.findUnique({ where: { id: programId } });

  if (!program) return null;

  // Simplified ROI calculation
  const trainingCost = 500 * analytics.completed; // $500 per completion
  const skillsGained = JSON.parse(program.targetSkills || "[]").length;
  const estimatedProductivityGain = skillsGained * 5000; // $5000 per skill
  const roi = ((estimatedProductivityGain - trainingCost) / trainingCost) * 100;

  return { trainingCost, estimatedProductivityGain, roi };
}

export async function getTrendAnalysis(programId: string, days: number = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const enrollments = await prisma.userEnrollment.findMany({
    where: {
      programId,
      enrolledAt: { gte: since },
    },
    include: { completions: true },
  });

  const dailyStats = Array.from({ length: days }).map((_, i) => {
    const date = new Date(since);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];

    const dayEnrollments = enrollments.filter(
      e => e.enrolledAt.toISOString().split("T")[0] === dateStr
    );

    return { date: dateStr, enrollments: dayEnrollments.length };
  });

  return dailyStats;
}
